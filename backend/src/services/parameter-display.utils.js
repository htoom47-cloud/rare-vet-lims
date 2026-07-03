/**
 * Parameter display helpers — report reference text, device codes, flags without range.
 */

const REFERENCE_NA = { en: 'N/A', ar: 'غير متوفر' };
const VALUE_NA = { en: 'N/A', ar: '—' };

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
  if (parameterId && deviceCodeMap[parameterId]) return deviceCodeMap[parameterId];
  if (deviceCode) return deviceCode;
  if (shortCode) return shortCode;
  return parameterCode || '';
};

const resolveDisplayNameAr = ({
  parameterId,
  parameterNameAr,
  parameterName,
  displayNameArMap = {},
}) => displayNameArMap[parameterId] || parameterNameAr || parameterName || '';

const resolveDisplayNameEn = ({
  parameterId,
  parameterName,
  displayNameEnMap = {},
}) => displayNameEnMap[parameterId] || parameterName || '';

const flagForReport = (evaluated) => {
  if (!evaluated?.hasReference) return '';
  const flag = evaluated.detailFlag || evaluated.flag || '';
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
  referenceNa,
  formatReferenceForReport,
  resolveDisplayCode,
  resolveDisplayNameAr,
  resolveDisplayNameEn,
  flagForReport,
  validateMinMax,
};
