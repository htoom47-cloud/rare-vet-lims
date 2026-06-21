const env = require('../../config/env');
const { formatToE164 } = require('../../utils/phone');

const twilioRequest = async ({ to, from, body }) => {
  const { accountSid, authToken } = env.notifications.twilio;
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials are not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.message || data.error_message || response.statusText;
    throw new Error(detail || 'Twilio request failed');
  }

  return data;
};

const resolveRecipient = (channel, recipient) => {
  const e164 = formatToE164(recipient);
  if (!e164) throw new Error('Invalid phone number');

  if (channel === 'whatsapp') {
    const from = env.notifications.twilio.whatsappFrom;
    if (!from) throw new Error('TWILIO_WHATSAPP_FROM is not configured');
    const to = e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
    const fromAddr = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
    return { to, from: fromAddr };
  }

  const from = env.notifications.twilio.smsFrom;
  if (!from) throw new Error('TWILIO_SMS_FROM is not configured');
  return { to: e164, from };
};

const send = async ({ channel, recipient, body }) => {
  const { to, from } = resolveRecipient(channel, recipient);
  const result = await twilioRequest({ to, from, body });
  return { provider: 'twilio', sid: result.sid };
};

module.exports = { send };
