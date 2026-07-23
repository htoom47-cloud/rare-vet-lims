/**
 * Rose Bengal (brucellosis) positive → confirmation note for reports.
 * ELISA assays are excluded.
 */

const ROSE_BENGAL_CODES = new Set(['BRUCELLA', 'BRU-ROSE-BENGAL']);

const NOTE_AR = 'ملاحظة: النتيجة الإيجابية تستلزم التأكيد باختبار ELISA.';
const NOTE_EN = 'Note: A positive result requires confirmation by ELISA.';

const isRoseBengalTestCode = (code) => {
  const c = String(code || '').trim().toUpperCase();
  if (!c || /ELISA/i.test(c)) return false;
  return ROSE_BENGAL_CODES.has(c) || c === 'BRU' || /^BRU[-_]?RB/i.test(c);
};

const isPositiveQualResult = (row = {}) => {
  if (row.flag === 'POS' || row.flag === 'POSITIVE') return true;
  const val = String(row.value || '').trim();
  return /^(positive|إيجابي|\+|pos)$/i.test(val);
};

const isPositiveRoseBengalRow = (row = {}) => (
  isRoseBengalTestCode(row.testCode || row.test_code)
  && isPositiveQualResult(row)
);

const hasPositiveRoseBengal = (results = []) =>
  (results || []).some(isPositiveRoseBengalRow);

const roseBengalConfirmNote = (lang = 'ar') =>
  (lang === 'en' ? NOTE_EN : NOTE_AR);

module.exports = {
  NOTE_AR,
  NOTE_EN,
  isRoseBengalTestCode,
  isPositiveRoseBengalRow,
  hasPositiveRoseBengal,
  roseBengalConfirmNote,
};
