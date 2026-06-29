/** Laboratory WhatsApp line — 0115007257 */
export const LAB_WHATSAPP_PHONE = '0115007257';

export const toWhatsAppDigits = (phone = LAB_WHATSAPP_PHONE) => {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('0')) return `966${digits.slice(1)}`;
  return `966${digits}`;
};

export const whatsAppUrl = (phone = LAB_WHATSAPP_PHONE, message) => {
  const base = `https://wa.me/${toWhatsAppDigits(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
};

export const openWhatsApp = (phone, message) => {
  window.open(whatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
};
