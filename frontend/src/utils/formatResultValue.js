export const isPositiveQual = (raw) => /^(positive|إيجابي|\+|pos|yes|نعم)$/i.test(String(raw || '').trim());
export const isNegativeQual = (raw) => /^(negative|سلبي|\-|neg|no|لا)$/i.test(String(raw || '').trim());

export const canonicalQualValue = (raw) => {
  if (isPositiveQual(raw)) return 'Positive';
  if (isNegativeQual(raw)) return 'Negative';
  return '';
};

export const formatResultValue = ({ value, unit, flag }, t) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';

  if (unit === 'qual') {
    if (flag === 'POS') return t('resultValidation.flags.POS');
    if (flag === 'NEG') return t('resultValidation.flags.NEG');
    if (isPositiveQual(raw)) return t('resultValidation.flags.POS');
    if (isNegativeQual(raw)) return t('resultValidation.flags.NEG');
    return raw;
  }

  return unit ? `${raw} ${unit}`.trim() : raw;
};

export const parameterDisplayName = (row, language) => (
  language === 'ar' && row?.parameter_name_ar ? row.parameter_name_ar : row?.parameter_name
);

export const testDisplayName = (test, language) => (
  language === 'ar' && test?.test_name_ar ? test.test_name_ar : test?.test_name
);
