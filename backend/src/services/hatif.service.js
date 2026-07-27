/**
 * Hatif (Voxa) WhatsApp integration — outbound text only (phase 1).
 * Disabled unless HATIF_WHATSAPP_ENABLED=true and credentials are set.
 * Never throws into lab/billing paths; callers handle AppError.
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

const isFeatureEnabled = () => !!env.features?.hatifWhatsapp;

const isConfigured = () => !!(
  env.hatif?.clientId
  && env.hatif?.clientSecret
  && env.hatif?.channelId
);

const getStatus = () => ({
  enabled: isFeatureEnabled(),
  configured: isConfigured(),
  sendReal: !!env.notifications?.sendReal,
  channelConfigured: !!env.hatif?.channelId,
});

const assertReady = () => {
  if (!isFeatureEnabled()) {
    throw new AppError('Hatif WhatsApp is disabled', 403, 'HATIF_DISABLED');
  }
  if (!isConfigured()) {
    throw new AppError('Hatif credentials are not configured', 503, 'HATIF_NOT_CONFIGURED');
  }
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

/**
 * Send a free-text WhatsApp message to a LIMS customer via Hatif.
 * Honours SEND_REAL_NOTIFICATIONS (dry-run when false).
 */
const sendCustomerWhatsApp = async (customerId, { message }, userId, req = null) => {
  assertReady();

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

  try {
    if (userId) {
      await query(
        `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(),
          userId,
          'hatif_whatsapp_send',
          'hatif',
          'customer',
          customer.id,
          JSON.stringify({
            channel: 'hatif_whatsapp',
            to: toNumber,
            dryRun,
            messagePreview: text.slice(0, 200),
            providerStatus: providerResult?.status || (dryRun ? 'dry_run' : null),
            conversationEventId: providerResult?.conversationEventId || null,
          }),
          req?.ip || null,
          req?.get?.('user-agent') || null,
        ]
      );
    }
  } catch (err) {
    logger.warn('Hatif audit log failed', { error: err.message });
  }

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

module.exports = {
  getStatus,
  isFeatureEnabled,
  isConfigured,
  sendCustomerWhatsApp,
};
