const crypto = require('crypto');

const SAMPLE_CODE_MIN = 26000001;
const SAMPLE_CODE_MAX = 26999999;
const SAMPLE_SEQUENCE_LOCK = 26999901;
const ANIMAL_CODE_LOCK = 38472901;

const generateCode = (prefix, length = 6) => {
  const num = Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${prefix}-${date}-${num}`;
};

/** Random 6-digit animal ID for newly created animals (100000–999999). */
const generateRandomAnimalCode = async (queryFn) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    // eslint-disable-next-line no-await-in-loop
    const exists = await queryFn(
      'SELECT 1 FROM animals WHERE animal_code = $1 LIMIT 1',
      [code]
    );
    if (!exists.rows.length) return code;
  }
  throw new Error('Could not generate unique animal code');
};

/**
 * Sequential sample ID: 26000001 … 26999999, then wraps to 26000001.
 * Must run inside a transaction after pg_advisory_xact_lock(SAMPLE_SEQUENCE_LOCK).
 */
const generateNextSampleCode = async (queryFn) => {
  const result = await queryFn(
    `SELECT COALESCE(MAX(sample_code::bigint), $1 - 1) AS max_code
     FROM samples
     WHERE sample_code ~ '^[0-9]+$'
       AND sample_code::bigint >= $1
       AND sample_code::bigint <= $2`,
    [SAMPLE_CODE_MIN, SAMPLE_CODE_MAX]
  );
  let next = Number(result.rows[0].max_code) + 1;
  if (!Number.isFinite(next) || next < SAMPLE_CODE_MIN) next = SAMPLE_CODE_MIN;
  if (next > SAMPLE_CODE_MAX) next = SAMPLE_CODE_MIN;
  return String(next);
};

/** 12-digit barcode: YYMMDD + 6 random digits (Code128 scan value). */
const generateBarcodeDigitsId = (suffixLength = 6) => {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const num = Math.floor(Math.random() * 10 ** suffixLength).toString().padStart(suffixLength, '0');
  return `${date}${num}`;
};

/** @deprecated use generateBarcodeDigitsId */
const generateSampleDigitsId = generateBarcodeDigitsId;

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

/** SQL: normalize stored mobile to 9-digit local (5xxxxxxxx) for reliable portal lookup */
const sqlNormalizeMobileDigits = (column = 'mobile') => {
  const d = `regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return `(CASE WHEN ${d} LIKE '966%' AND length(${d}) >= 12 THEN substring(${d} from 4) WHEN ${d} LIKE '0%' AND length(${d}) >= 10 THEN substring(${d} from 2) ELSE ${d} END)`;
};

const mobileEqualsSql = (column, paramIndex) => (
  `${sqlNormalizeMobileDigits(column)} = $${paramIndex}`
);

module.exports = {
  generateCode,
  generateRandomAnimalCode,
  generateNextSampleCode,
  generateBarcodeDigitsId,
  generateSampleDigitsId,
  SAMPLE_CODE_MIN,
  SAMPLE_CODE_MAX,
  SAMPLE_SEQUENCE_LOCK,
  ANIMAL_CODE_LOCK,
  sampleDigitsOnly,
  hashToken,
  paginate,
  buildPagination,
  evaluateFlag,
  normalizeMobileDigits,
  sqlNormalizeMobileDigits,
  mobileEqualsSql,
};
