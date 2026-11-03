/**
 * Tamara Checkout API + webhook handling for LIMS invoice payments.
 * Feature-flagged via TAMARA_ENABLED; secrets from env only.
 */
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');
const billing = require('./billing.service');

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const assertTamaraEnabled = () => {
  if (!env.features?.tamaraPayments) {
    throw new AppError('Tamara payments are disabled', 403, 'FEATURE_DISABLED');
  }
  if (!env.tamara?.apiToken || !env.tamara?.apiUrl) {
    throw new AppError('Tamara API is not configured', 503, 'TAMARA_NOT_CONFIGURED');
  }
};

const normalizeSaPhone = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('966')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

const splitName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: 'Customer', last_name: 'Lab' };
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
};

const amountObj = (amount, currency = 'SAR') => ({
  amount: money(amount),
  currency,
});

const tamaraFetch = async (path, { method = 'GET', body } = {}) => {
  const url = `${env.tamara.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.tamara.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.raw || `Tamara HTTP ${res.status}`;
    logger.warn('Tamara API error', { path, status: res.status, message: String(msg).slice(0, 200) });
    throw new AppError(String(msg).slice(0, 300), res.status >= 400 && res.status < 500 ? 400 : 502, 'TAMARA_API');
  }
  return data;
};

const verifyWebhookToken = (req) => {
  const token = req.query?.tamaraToken
    || (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i) || [])[1]
    || '';
  if (!token) {
    throw new AppError('Missing Tamara notification token', 401, 'TAMARA_WEBHOOK_AUTH');
  }
  const secret = env.tamara?.notificationToken;
  if (!secret) {
    throw new AppError('Tamara notification token is not configured', 503, 'TAMARA_NOT_CONFIGURED');
  }
  try {
    jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError('Invalid Tamara notification token', 401, 'TAMARA_WEBHOOK_AUTH');
  }
};

const loadInvoiceForCheckout = async (invoiceId) => {
  const invoice = await billing.getInvoiceById(invoiceId);
  if (['cancelled', 'refunded'].includes(invoice.status)) {
    throw new AppError('Cannot pay a cancelled or refunded invoice', 400, 'INVALID_STATUS');
  }
  const balance = money(invoice.balance_due);
  if (!(balance > 0.009)) {
    throw new AppError('Invoice has no balance due', 400, 'ALREADY_PAID');
  }
  const cust = await query(
    `SELECT id, full_name, full_name_ar, mobile, email, created_at
     FROM customers WHERE id = $1 AND deleted_at IS NULL`,
    [invoice.customer_id]
  );
  const customer = cust.rows[0];
  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  const phone = normalizeSaPhone(customer.mobile);
  if (phone.length < 9) {
    throw new AppError('Customer mobile is required for Tamara checkout', 400, 'CUSTOMER_MOBILE_REQUIRED');
  }
  return { invoice, customer, balance, phone };
};

const buildCheckoutPayload = ({ invoice, customer, balance, phone, orderReferenceId }) => {
  const name = splitName(customer.full_name_ar || customer.full_name);
  const staffBase = (env.staffAppUrl || env.appUrl || 'https://lims.rarevetcare.com').replace(/\/$/, '');
  const created = customer.created_at ? new Date(customer.created_at) : new Date();
  const ddMmYyyy = `${String(created.getDate()).padStart(2, '0')}-${String(created.getMonth() + 1).padStart(2, '0')}-${created.getFullYear()}`;
  const address = {
    first_name: name.first_name,
    last_name: name.last_name,
    line1: env.lab?.address || 'Kingdom of Saudi Arabia',
    city: 'Riyadh',
    country_code: 'SA',
    phone_number: phone,
  };

  return {
    order_reference_id: orderReferenceId,
    order_number: invoice.invoice_number,
    total_amount: amountObj(balance),
    description: `Lab invoice ${invoice.invoice_number}`.slice(0, 256),
    country_code: 'SA',
    payment_type: 'PAY_BY_INSTALMENTS',
    instalments: env.tamara.instalments || 3,
    locale: 'ar_SA',
    platform: 'RareVetLIMS',
    items: [{
      reference_id: invoice.id,
      type: 'Digital',
      name: `Invoice ${invoice.invoice_number}`.slice(0, 255),
      sku: String(invoice.invoice_number || invoice.id).slice(0, 128),
      quantity: 1,
      unit_price: amountObj(balance),
      tax_amount: amountObj(0),
      discount_amount: amountObj(0),
      total_amount: amountObj(balance),
    }],
    consumer: {
      first_name: name.first_name,
      last_name: name.last_name,
      phone_number: phone,
      ...(customer.email ? { email: customer.email } : {}),
    },
    shipping_address: address,
    billing_address: address,
    tax_amount: amountObj(0),
    shipping_amount: amountObj(0),
    merchant_url: {
      success: `${staffBase}/billing?tamara=success&invoice=${invoice.id}`,
      failure: `${staffBase}/billing?tamara=failure&invoice=${invoice.id}`,
      cancel: `${staffBase}/billing?tamara=cancel&invoice=${invoice.id}`,
    },
    risk_assessment: {
      is_premium_customer: false,
      account_creation_date: ddMmYyyy,
      total_order_count: 1,
      date_first_paid: ddMmYyyy,
      date_last_paid: ddMmYyyy,
      is_phone_verified: true,
    },
  };
};

const createCheckout = async (invoiceId, userId) => {
  assertTamaraEnabled();
  const { invoice, customer, balance, phone } = await loadInvoiceForCheckout(invoiceId);
  const orderReferenceId = uuidv4();
  const payload = buildCheckoutPayload({
    invoice, customer, balance, phone, orderReferenceId,
  });
  const created = await tamaraFetch('/checkout', { method: 'POST', body: payload });
  if (!created?.order_id || !created?.checkout_url) {
    throw new AppError('Tamara checkout response incomplete', 502, 'TAMARA_API');
  }

  const row = await query(
    `INSERT INTO tamara_checkouts
       (id, invoice_id, order_reference_id, tamara_order_id, checkout_id, checkout_url,
        amount, currency, status, raw_last_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'SAR','created',$8::jsonb)
     RETURNING *`,
    [
      uuidv4(),
      invoice.id,
      orderReferenceId,
      created.order_id,
      created.checkout_id || null,
      created.checkout_url,
      balance,
      JSON.stringify({ created_by: userId || null, response: { order_id: created.order_id, checkout_id: created.checkout_id } }),
    ]
  );

  return {
    checkout: row.rows[0],
    checkout_url: created.checkout_url,
    tamara_order_id: created.order_id,
    amount: balance,
  };
};

const getCheckoutStatus = async (invoiceId) => {
  assertTamaraEnabled();
  const result = await query(
    `SELECT id, invoice_id, order_reference_id, tamara_order_id, checkout_id, checkout_url,
            amount, currency, status, payment_id, created_at, updated_at
     FROM tamara_checkouts
     WHERE invoice_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [invoiceId]
  );
  return result.rows[0] || null;
};

const findCheckout = async ({ tamaraOrderId, orderReferenceId }) => {
  if (tamaraOrderId) {
    const byTamara = await query(
      `SELECT * FROM tamara_checkouts WHERE tamara_order_id = $1 LIMIT 1`,
      [tamaraOrderId]
    );
    if (byTamara.rows[0]) return byTamara.rows[0];
  }
  if (orderReferenceId) {
    const byRef = await query(
      `SELECT * FROM tamara_checkouts WHERE order_reference_id = $1 LIMIT 1`,
      [orderReferenceId]
    );
    if (byRef.rows[0]) return byRef.rows[0];
  }
  return null;
};

const updateCheckout = async (id, patch) => {
  const result = await query(
    `UPDATE tamara_checkouts SET
       status = COALESCE($2, status),
       payment_id = COALESCE($3, payment_id),
       raw_last_event = COALESCE($4::jsonb, raw_last_event),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, patch.status || null, patch.payment_id || null, patch.raw_last_event ? JSON.stringify(patch.raw_last_event) : null]
  );
  return result.rows[0];
};

const alreadyPaidForCheckout = async (checkout) => {
  if (checkout.payment_id) return true;
  if (!checkout.tamara_order_id) return false;
  const existing = await query(
    `SELECT id FROM payments
     WHERE invoice_id = $1 AND reference_number = $2
     LIMIT 1`,
    [checkout.invoice_id, checkout.tamara_order_id]
  );
  return Boolean(existing.rows[0]);
};

const authoriseOrder = async (tamaraOrderId) => {
  try {
    return await tamaraFetch(`/orders/${tamaraOrderId}/authorise`, { method: 'POST', body: {} });
  } catch (err) {
    // Auto-authorisation merchants may already be authorised.
    if (err.code === 'TAMARA_API') {
      logger.info('Tamara authorise skipped/failed (may be auto-auth)', { orderId: tamaraOrderId });
      return null;
    }
    throw err;
  }
};

const captureOrder = async (checkout) => {
  try {
    return await tamaraFetch('/payments/capture', {
      method: 'POST',
      body: {
        order_id: checkout.tamara_order_id,
        total_amount: amountObj(checkout.amount, checkout.currency || 'SAR'),
      },
    });
  } catch (err) {
    logger.warn('Tamara capture failed (payment may still be authorised)', {
      orderId: checkout.tamara_order_id,
      message: err.message,
    });
    return null;
  }
};

const recordTamaraPaymentOnce = async (checkout) => {
  if (await alreadyPaidForCheckout(checkout)) {
    const paid = await query(
      `SELECT id FROM payments WHERE invoice_id = $1 AND reference_number = $2 LIMIT 1`,
      [checkout.invoice_id, checkout.tamara_order_id]
    );
    if (paid.rows[0] && !checkout.payment_id) {
      await updateCheckout(checkout.id, { payment_id: paid.rows[0].id, status: checkout.status });
    }
    return { skipped: true, reason: 'already_paid' };
  }

  const invoice = await billing.getInvoiceById(checkout.invoice_id);
  const balance = money(invoice.balance_due);
  const amount = money(Math.min(balance, parseFloat(checkout.amount) || balance));
  if (!(amount > 0.009)) {
    return { skipped: true, reason: 'no_balance' };
  }

  const payment = await billing.recordPayment({
    invoice_id: checkout.invoice_id,
    amount,
    method: 'tamara',
    reference_number: checkout.tamara_order_id,
    notes: 'Tamara checkout (webhook)',
  }, null, null, { skipDayAssert: true });

  await updateCheckout(checkout.id, {
    payment_id: payment.id,
    status: 'authorised',
  });

  void captureOrder({ ...checkout, amount }).then(async (cap) => {
    if (cap) {
      await updateCheckout(checkout.id, {
        payment_id: payment.id,
        status: 'captured',
        raw_last_event: { capture: true },
      }).catch(() => {});
    }
  });

  return { payment, skipped: false };
};

const mapEventStatus = (eventType) => {
  const map = {
    order_approved: 'approved',
    order_declined: 'declined',
    order_authorised: 'authorised',
    order_canceled: 'canceled',
    order_cancelled: 'canceled',
    order_expired: 'expired',
    order_captured: 'captured',
  };
  return map[eventType] || null;
};

const handleWebhook = async (req) => {
  assertTamaraEnabled();
  verifyWebhookToken(req);

  const body = req.body || {};
  const eventType = String(body.event_type || '').trim();
  const tamaraOrderId = body.order_id || null;
  const orderReferenceId = body.order_reference_id || null;

  let checkout = await findCheckout({ tamaraOrderId, orderReferenceId });
  if (!checkout) {
    logger.warn('Tamara webhook for unknown checkout', { eventType, tamaraOrderId });
    return { ok: true, ignored: true, reason: 'unknown_checkout' };
  }

  const status = mapEventStatus(eventType) || checkout.status;
  await updateCheckout(checkout.id, {
    status,
    raw_last_event: body,
  });
  checkout = { ...checkout, status };

  if (eventType === 'order_approved') {
    // Authorise only; payment is recorded on order_authorised / after successful auth.
    const auth = await authoriseOrder(checkout.tamara_order_id);
    let settled = null;
    if (auth) {
      settled = await recordTamaraPaymentOnce(checkout);
    }
    return { ok: true, eventType, authorised: Boolean(auth), settled };
  }

  if (eventType === 'order_authorised' || eventType === 'order_captured') {
    const settled = await recordTamaraPaymentOnce(checkout);
    if (eventType === 'order_captured') {
      await updateCheckout(checkout.id, {
        status: 'captured',
        payment_id: settled.payment?.id || checkout.payment_id,
      });
    }
    return { ok: true, eventType, settled };
  }

  return { ok: true, eventType, status };
};

module.exports = {
  createCheckout,
  getCheckoutStatus,
  handleWebhook,
  verifyWebhookToken,
  assertTamaraEnabled,
};
