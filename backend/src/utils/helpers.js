const crypto = require('crypto');

const generateCode = (prefix, length = 6) => {
  const num = Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${prefix}-${date}-${num}`;
};

/** Unified 12-digit sample ID — YYMMDD + 6 random digits (same value for sample_code and barcode). */
const generateSampleDigitsId = (suffixLength = 6) => {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const num = Math.floor(Math.random() * 10 ** suffixLength).toString().padStart(suffixLength, '0');
  return `${date}${num}`;
};

const sampleDigitsOnly = (value) => String(value || '').replace(/\D/g, '');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const paginate = (page = 1, limit = 20) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return { page: p, limit: l, offset: (p - 1) * l };
};

const buildPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

const evaluateFlag = (value, min, max, criticalLow, criticalHigh) => {
  if (value === null || value === undefined || isNaN(value)) return { flag: '', isCritical: false };
  const num = parseFloat(value);
  if (criticalLow !== null && num < criticalLow) return { flag: 'CRIT_LOW', isCritical: true };
  if (criticalHigh !== null && num > criticalHigh) return { flag: 'CRIT_HIGH', isCritical: true };
  if (min !== null && num < min) return { flag: 'LOW', isCritical: false };
  if (max !== null && num > max) return { flag: 'HIGH', isCritical: false };
  return { flag: 'NORMAL', isCritical: false };
};

const normalizeMobileDigits = (mobile = '') => {
  let digits = String(mobile).replace(/\D/g, '');
  if (digits.startsWith('966')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

module.exports = {
  generateCode,
  generateSampleDigitsId,
  sampleDigitsOnly,
  hashToken,
  paginate,
  buildPagination,
  evaluateFlag,
  normalizeMobileDigits,
};
