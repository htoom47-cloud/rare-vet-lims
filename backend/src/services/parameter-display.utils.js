/**
 * Parameter display helpers — report reference text, device codes, flags without range.
 */

const REFERENCE_NA = { en: 'N/A', ar: 'غير متوفر' };
const VALUE_NA = { en: 'N/A', ar: '—' };

/** Lab-facing report labels (internal codes stay unchanged, e.g. BUN). */
const CANONICAL_REPORT_DISPLAY = {
  BUN: { code: 'UR', nameEn: 'Urea', nameAr: 'اليوريا' },
};

const referenceNa = (isArabic) => (isArabic ? REFERENCE_NA.ar : REFERENCE_NA.en);

const formatReferenceForReport = (reference, hasReference, isArabic) => {
  if (!hasReference) return referenceNa(isArabic);
  const text = reference != null ? String(reference).trim() : '';
  if (!text || text === '-') return referenceNa(isArabic);
  return text;
};

const resolveDisplayCode = ({
  parameterId,
  parameterCode,
  deviceCode,
  shortCode,
  deviceCodeMap = {},
}) => {
  const canonical = CANONICAL_REPORT_DISPLAY[String(parameterCode || '').toUpperCase()];
  if (canonical?.code) return canonical.code;
  if (parameterId && deviceCodeMap[parameterId]) return deviceCodeMap[parameterId];
  if (deviceCode) return deviceCode;
  if (shortCode) return shortCode;
  return parameterCode || '';
};

const resolveDisplayNameAr = ({
  parameterId,
  parameterCode,
  parameterNameAr,
  parameterName,
  displayNameArMap = {},
}) => {
  const canonical = CANONICAL_REPORT_DISPLAY[String(parameterCode || '').toUpperCase()];
  if (canonical?.nameAr) return canonical.nameAr;
  return displayNameArMap[parameterId] || parameterNameAr || parameterName || '';
};

const resolveDisplayNameEn = ({
  parameterId,
  parameterCode,
  parameterName,
  displayNameEnMap = {},
}) => {
  const canonical = CANONICAL_REPORT_DISPLAY[String(parameterCode || '').toUpperCase()];
  if (canonical?.nameEn) return canonical.nameEn;
  return displayNameEnMap[parameterId] || parameterName || '';
};

const flagForReport = (evaluated) => {
  const flag = evaluated?.detailFlag || evaluated?.flag || '';
  // Qualitative POS/NEG must survive even without numeric reference ranges
  // (e.g. Rose Bengal) — otherwise portal KPIs treat positives as "normal".
  if (flag === 'POS' || flag === 'NEG') return flag;
  if (!evaluated?.hasReference) return '';
  if (flag === 'NORMAL_WITHOUT_REF' || flag === 'MISSING') return '';
  if (flag === 'CRITICAL') return evaluated.detailFlag || 'CRIT_HIGH';
  return flag;
};

const validateMinMax = (minValue, maxValue) => {
  if (minValue == null || maxValue == null) return null;
  const min = Number(minValue);
  const max = Number(maxValue);
  if (Number.isNaN(min) || Number.isNaN(max)) return null;
  if (min > max) return 'Min cannot be greater than Max';
  return null;
};

module.exports = {
  REFERENCE_NA,
  CANONICAL_REPORT_DISPLAY,
  referenceNa,
  formatReferenceForReport,
  resolveDisplayCode,
  resolveDisplayNameAr,
  resolveDisplayNameEn,
  flagForReport,
  validateMinMax,
};
