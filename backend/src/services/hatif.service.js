/**
 * Hatif (Voxa) integration — WhatsApp text + live-agent call prep (no IVR).
 * Disabled unless feature flags are on and credentials are set.
 */
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const { formatToE164 } = require('../utils/phone');
const { query } = require('../config/database');
const { notDeleted } = require('../utils/soft-delete-sql');
const { uuidv4 } = require('../utils/uuid');
const logger = require('../config/logger');

let cachedToken = null;
let tokenExpiresAt = 0;

const isWhatsappEnabled = () => !!env.features?.hatifWhatsapp;
const isCallEnabled = () => !!env.features?.hatifCall;

const isConfigured = () => !!(
  env.hatif?.clientId
  && env.hatif?.clientSecret
  && env.hatif?.channelId
);

const getStatus = () => ({
  enabled: isWhatsappEnabled(),
  callEnabled: isCallEnabled(),
  configured: isConfigured(),
  sendReal: !!env.notifications?.sendReal,
  channelConfigured: !!env.hatif?.channelId,
  appUrlConfigured: !!env.hatif?.appUrl,
});

const assertConfigured = () => {
  if (!isConfigured()) {
    throw new AppError('Hatif credentials are not configured', 503, 'HATIF_NOT_CONFIGURED');
  }
};

const assertWhatsappReady = () => {
  if (!isWhatsappEnabled()) {
    throw new AppError('Hatif WhatsApp is disabled', 403, 'HATIF_DISABLED');
  }
  assertConfigured();
};

const assertCallReady = () => {
  if (!isCallEnabled()) {
    throw new AppError('Hatif call is disabled', 403, 'HATIF_CALL_DISABLED');
  }
  assertConfigured();
};

const toHatifNumber = (mobile) => {
  const e164 = formatToE164(mobile);
  if (!e164) return null;
  return e164.replace(/^\+/, '');
};

const getAccessToken = async () => {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const body = new URLSearchParams({
    client_id: env.hatif.clientId,
    client_secret: env.hatif.clientSecret,
    grant_type: 'client_credentials',
    scope: 'VoxaAPI',
  });

  const res = await fetch(env.hatif.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new AppError(
      data.error_description || data.error || 'Hatif authentication failed',
      502,
      'HATIF_AUTH_FAILED'
    );
  }

  cachedToken = data.access_token;
  const ttlSec = Number(data.expires_in) || 3600;
  tokenExpiresAt = now + ttlSec * 1000;
  return cachedToken;
};

const sendWhatsAppText = async ({ toNumber, text }) => {
  const token = await getAccessToken();
  const res = await fetch(`${env.hatif.apiBase}/v1/whatsapp/service-account/sendText`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ChannelId: env.hatif.channelId,
      Text: text,
      ToNumber: toNumber,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      data.message || data.title || data.error || 'Hatif WhatsApp send failed',
      502,
      'HATIF_SEND_FAILED'
    );
  }
  return data;
};

const createConversation = async ({ phoneNumber, contactName }) => {
  const token = await getAccessToken();
  const res = await fetch(`${env.hatif.apiBase}/v2/conversations/service-account/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelId: env.hatif.channelId,
      phoneNumber,
      contactName: contactName || null,
      assignToUserId: null,
      assignToAiAgentId: null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      data.message || data.title || data.error || 'Hatif create conversation failed',
      502,
      'HATIF_CONVERSATION_FAILED'
    );
  }
  return data;
};

const buildHatifOpenUrl = (conversationId) => {
  const template = String(env.hatif?.conversationUrlTemplate || '').trim();
  if (template && conversationId) {
    return template
      .replace(/\{id\}/gi, conversationId)
      .replace(/\{conversationId\}/gi, conversationId);
  }
  // Open Hatif home only — inventing /conversations/{id} caused 404 in production UI.
  const base = String(env.hatif?.appUrl || '').trim().replace(/\/$/, '');
  return base || null;
};

const writeAudit = async ({ userId, action, customerId, values, req }) => {
  try {
    if (!userId) return;
    await query(
      `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(),
        userId,
        action,
        'hatif',
        'customer',
        customerId,
        JSON.stringify(values),
        req?.ip || null,
        req?.get?.('user-agent') || null,
      ]
    );
  } catch (err) {
    logger.warn('Hatif audit log failed', { error: err.message, action });
  }
};

/**
 * Send a free-text WhatsApp message to a LIMS customer via Hatif.
 * Honours SEND_REAL_NOTIFICATIONS (dry-run when false).
 */
const sendCustomerWhatsApp = async (customerId, { message }, userId, req = null) => {
  assertWhatsappReady();

  const text = String(message || '').trim();
  if (!text) throw new AppError('Message is required', 400, 'VALIDATION');
  if (text.length > 4000) throw new AppError('Message is too long', 400, 'VALIDATION');

  const cust = await query(
    `SELECT id, full_name, full_name_ar, mobile FROM customers WHERE id = $1 AND ${notDeleted('customers')}`,
    [customerId]
  );
  const customer = cust.rows[0];
  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const toNumber = toHatifNumber(customer.mobile);
  if (!toNumber) throw new AppError('Customer mobile is invalid', 400, 'INVALID_MOBILE');

  const dryRun = !env.notifications.sendReal;
  let providerResult = null;

  if (!dryRun) {
    providerResult = await sendWhatsAppText({ toNumber, text });
  }

  await writeAudit({
    userId,
    action: 'hatif_whatsapp_send',
    customerId: customer.id,
    values: {
      channel: 'hatif_whatsapp',
      to: toNumber,
      dryRun,
      messagePreview: text.slice(0, 200),
      providerStatus: providerResult?.status || (dryRun ? 'dry_run' : null),
      conversationEventId: providerResult?.conversationEventId || null,
    },
    req,
  });

  return {
    dryRun,
    customerId: customer.id,
    customerName: customer.full_name_ar || customer.full_name,
    to: toNumber,
    provider: providerResult,
    userMessage: dryRun
      ? 'وضع الاختبار: لم تُرسل رسالة فعلية عبر هاتِف (SEND_REAL_NOTIFICATIONS=false).'
      : undefined,
  };
};

/**
 * Create/open Hatif conversation and return app URL for staff.
 * mode: 'call' | 'whatsapp'
 */
const prepareCustomerHatifSession = async (customerId, userId, req, mode) => {
  if (mode === 'call') assertCallReady();
  else assertWhatsappReady();

  const cust = await query(
    `SELECT id, full_name, full_name_ar, mobile FROM customers WHERE id = $1 AND ${notDeleted('customers')}`,
    [customerId]
  );
  const customer = cust.rows[0];
  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const e164 = formatToE164(customer.mobile);
  const toNumber = toHatifNumber(customer.mobile);
  if (!toNumber || !e164) throw new AppError('Customer mobile is invalid', 400, 'INVALID_MOBILE');

  const contactName = customer.full_name_ar || customer.full_name || toNumber;
  let conversationId = null;
  let contactId = null;
  let createError = null;

  try {
    const created = await createConversation({ phoneNumber: e164, contactName });
    const conversation = created.conversation || created;
    conversationId = conversation.id || created.conversationId || null;
    contactId = created.contactId || conversation.contactId || null;
  } catch (err) {
    createError = err.message;
    logger.warn('Hatif create conversation for session prep failed', { error: err.message, mode });
  }

  const openUrl = buildHatifOpenUrl(conversationId);
  if (!openUrl) {
    throw new AppError(
      'Hatif app URL is not configured (set HATIF_APP_URL)',
      503,
      'HATIF_APP_URL_MISSING'
    );
  }

  const isWhatsapp = mode === 'whatsapp';
  await writeAudit({
    userId,
    action: isWhatsapp ? 'hatif_whatsapp_open' : 'hatif_call_prepare',
    customerId: customer.id,
    values: {
      channel: isWhatsapp ? 'hatif_whatsapp_open' : 'hatif_live_agent_prep',
      to: toNumber,
      conversationId,
      contactId,
      openUrl,
      createError,
    },
    req,
  });

  let userMessage;
  if (isWhatsapp) {
    userMessage = conversationId
      ? 'تم تجهيز واتساب العميل في هاتِف — أكمل المحادثة من التطبيق.'
      : 'تم فتح هاتِف — ابحث عن رقم العميل وافتح واتسابه.';
  } else {
    userMessage = conversationId
      ? 'تم تجهيز محادثة العميل في هاتِف — افتح التطبيق واضغط اتصال من رقم العيادة.'
      : 'تم فتح هاتِف — ابحث عن رقم العميل ثم اضغط اتصال من رقم العيادة.';
  }

  return {
    dryRun: false,
    customerId: customer.id,
    customerName: contactName,
    to: toNumber,
    conversationId,
    contactId,
    openUrl,
    userMessage,
  };
};

/** Prepare live-agent call: open Hatif for staff to dial. */
const prepareCustomerCall = (customerId, userId, req = null) => (
  prepareCustomerHatifSession(customerId, userId, req, 'call')
);

/** Open Hatif WhatsApp UI for staff to chat with the customer. */
const openCustomerWhatsApp = (customerId, userId, req = null) => (
  prepareCustomerHatifSession(customerId, userId, req, 'whatsapp')
);

/** Accept leftover Outbound IVR webhooks (no-op; IVR path retired). */
const handleOutboundIvrWebhook = async (body) => {
  logger.info('Hatif outbound IVR webhook (ignored)', {
    id: body?.id,
    status: body?.status,
    externalId: body?.externalId,
  });
  return { received: true };
};

module.exports = {
  getStatus,
  isFeatureEnabled: isWhatsappEnabled,
  isConfigured,
  sendCustomerWhatsApp,
  openCustomerWhatsApp,
  prepareCustomerCall,
  placeCustomerOutboundCall: prepareCustomerCall,
  handleOutboundIvrWebhook,
};
