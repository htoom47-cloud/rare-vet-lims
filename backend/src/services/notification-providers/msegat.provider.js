const env = require('../../config/env');
const { formatToE164 } = require('../../utils/phone');

const MSEGAT_URL = env.notifications.msegat.apiUrl;

const MSEGAT_ERROR_AR = {
  '1060': 'رصيد الرسائل غير كافٍ',
  '1061': 'الرسالة مكررة',
  '1110': 'اسم المرسل غير صحيح أو غير مفعّل',
  '1120': 'رقم الجوال غير صحيح',
  '1140': 'نص الرسالة طويل جداً لمزوّد SMS',
  '1140-': 'نص الرسالة طويل جداً لمزوّد SMS',
  '1050': 'نص الرسالة فارغ',
  '1020': 'بيانات الدخول لخدمة SMS غير صحيحة',
};

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

const humanizeMsegatError = (data, raw) => {
  const code = String(data?.code ?? '').trim();
  if (code && MSEGAT_ERROR_AR[code]) return MSEGAT_ERROR_AR[code];
  const codeBase = code.replace(/-$/, '');
  if (codeBase && MSEGAT_ERROR_AR[codeBase]) return MSEGAT_ERROR_AR[codeBase];
  const detail = data?.message || data?.error;
  if (typeof detail === 'string' && detail && !/^\d+\.[a-f0-9]/i.test(detail)) {
    return detail;
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const c = String(parsed?.code ?? '').trim();
      if (c && MSEGAT_ERROR_AR[c]) return MSEGAT_ERROR_AR[c];
      if (MSEGAT_ERROR_AR[c.replace(/-$/, '')]) return MSEGAT_ERROR_AR[c.replace(/-$/, '')];
    } catch { /* ignore */ }
  }
  return code ? `فشل إرسال SMS (رمز ${code})` : 'فشل إرسال SMS عبر Msegat';
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
    throw new Error(humanizeMsegatError(data, raw));
  }

  return {
    provider: 'msegat',
    bulk_id: data.bulkId || data.bulk_id || data.id || null,
    code: data.code || raw.trim(),
  };
};

module.exports = { send };
