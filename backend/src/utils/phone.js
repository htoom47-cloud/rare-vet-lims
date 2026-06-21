const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const formatToE164 = (phone, defaultCountry = '966') => {
  const raw = String(phone || '').trim();
  if (!raw) return null;

  if (raw.startsWith('+')) {
    const digits = normalizeDigits(raw);
    return digits ? `+${digits}` : null;
  }

  let digits = normalizeDigits(raw);
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `${defaultCountry}${digits.slice(1)}`;
  if (!digits.startsWith(defaultCountry) && digits.length === 9) digits = `${defaultCountry}${digits}`;

  return `+${digits}`;
};

module.exports = { formatToE164 };
