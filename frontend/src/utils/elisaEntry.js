/** ELISA special entry helpers — active only when staff feature elisaSpecialEntry is on. */

export const isElisaTest = (test = {}) => {
  const cat = String(test.category_code || test.categoryCode || '').toUpperCase();
  if (cat === 'ELISA') return true;
  const code = String(test.test_code || test.code || '').toUpperCase();
  if (code && (code.startsWith('ELISA') || code.includes('ELISA'))) return true;
  const name = `${test.test_name || test.name || ''} ${test.test_name_ar || test.name_ar || ''}`;
  return /ELISA|إليزا|اليزا/i.test(name);
};

export const isQualParam = (param = {}) => String(param.unit || '').toLowerCase() === 'qual';

export const isSpParam = (param = {}) => {
  if (isQualParam(param)) return false;
  const code = String(param.code || param.parameter_code || '').toUpperCase();
  return /SP|S\/P|RATIO/.test(code);
};

/** Prefer dedicated S/P param; else first non-qual numeric/text param. */
export const findSpParamIndex = (fields = []) => {
  const byCode = fields.findIndex(isSpParam);
  if (byCode >= 0) return byCode;
  return fields.findIndex((p) => !isQualParam(p));
};

export const findQualParamIndex = (fields = []) => fields.findIndex(isQualParam);

export const elisaTechniqueLabel = (test = {}, lang = 'en') => {
  const method = String(test.method || test.test_method || '').trim() || 'ELISA';
  if (/^ELISA$/i.test(method) || /^إليزا$/i.test(method) || /^اليزا$/i.test(method)) {
    return lang === 'ar' || String(lang).startsWith('ar') ? 'إليزا' : 'ELISA';
  }
  return method;
};
