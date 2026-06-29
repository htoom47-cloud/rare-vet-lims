const env = require('../../config/env');
const { formatToE164 } = require('../../utils/phone');

const MSEGAT_URL = env.notifications.msegat.apiUrl;

const toMsegatNumber = (recipient) => {
  const e164 = formatToE164(recipient);
  if (!e164) throw new Error('Invalid phone number');
  return e164.replace(/^\+/, '');
};

const isSuccess = (data, raw) => {
  const code = String(data?.code ?? '').trim();
  const rawTrim = String(raw || '').trim();
  if (code === '1' || code === 'M0000') return true;
  if (rawTrim === '1') return true;
  if (/success/i.test(String(data?.message || ''))) return true;
  return false;
};

const send = async ({ channel, recipient, body }) => {
  if (channel !== 'sms') {
    throw new Error('Msegat supports SMS only — use Twilio for WhatsApp');
  }

  const { username, apiKey, sender, msgEncoding } = env.notifications.msegat;
  if (!username || !apiKey || !sender) {
    throw new Error('Msegat not configured — set MSEGAT_USERNAME, MSEGAT_API_KEY, MSEGAT_SENDER');
  }

  const response = await fetch(MSEGAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      userName: username,
      apiKey,
      userSender: sender,
      numbers: toMsegatNumber(recipient),
      msg: body,
      msgEncoding: msgEncoding || 'UTF8',
      reqFilter: 'true',
      reqBulkId: 'true',
    }),
  });

  const raw = await response.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    data = { code: raw.trim(), message: raw.trim() };
  }

  if (!response.ok || !isSuccess(data, raw)) {
    const detail = data.message || data.error || raw || response.statusText;
    throw new Error(typeof detail === 'string' ? detail : 'Msegat send failed');
  }

  return {
    provider: 'msegat',
    bulk_id: data.bulkId || data.bulk_id || data.id || null,
    code: data.code || raw.trim(),
  };
};

module.exports = { send };
