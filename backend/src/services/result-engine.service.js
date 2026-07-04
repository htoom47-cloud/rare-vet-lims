/**
 * Result Engine — single source for normalized values, reference display, flags, and report rows.
 *
 * Uses reference-range-engine for bounds/flags (never result_values.notes).
 * Uses device-mapping-engine value_type rules for CBC count vs percentage.
 */
const { getNormaPanelRow } = require('../utils/norma-cbc-map');
const mappingEngine = require('./device-mapping-engine.service');
const refEngine = require('./reference-range-engine.service');
const {
  formatReferenceForReport,
  resolveDisplayCode,
  resolveDisplayNameAr,
  resolveDisplayNameEn,
  flagForReport,
} = require('./parameter-display.utils');

const VALUE_TYPES = {
  COUNT: 'count',
  NUMERIC: 'numeric',
  PERCENTAGE: 'percentage',
  QUAL: 'qual',
  TEXT: 'text',
};

const RESULT_FLAGS = {
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  LOW: 'LOW',
  CRITICAL: 'CRITICAL',
  CRIT_LOW: 'CRIT_LOW',
  CRIT_HIGH: 'CRIT_HIGH',
  MISSING: 'MISSING',
  NORMAL_WITHOUT_REF: 'NORMAL_WITHOUT_REF',
  POS: 'POS',
  NEG: 'NEG',
  NONE: '',
};

const isPositiveQual = (raw) => /^(positive|إيجابي|\+|pos|yes|نعم)$/i.test(String(raw || '').trim());
const isNegativeQual = (raw) => /^(negative|سلبي|\-|neg|no|لا)$/i.test(String(raw || '').trim());

const formatNumber = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
};

const inferValueType = (result = {}, context = {}) => {
  const unit = result.unit ?? context.unit;
  if (unit === 'qual') return VALUE_TYPES.QUAL;
  const code = result.parameter_code || context.parameter_code;
  if (code && mappingEngine.NORMA_CBC_VALUE_TYPES[code]) {
    return mappingEngine.NORMA_CBC_VALUE_TYPES[code];
  }
  if (result.value_type || context.value_type) {
    return result.value_type || context.value_type;
  }
  return VALUE_TYPES.NUMERIC;
};

const normalizeResultValue = (rawValue, valueType = VALUE_TYPES.NUMERIC) => {
  const raw = rawValue == null ? '' : String(rawValue).trim();
  if (raw === '') {
    return {
      value: null,
      numericValue: null,
      displayValue: null,
      isMissing: true,
      qual: null,
    };
  }

  if (valueType === VALUE_TYPES.QUAL) {
    if (isPositiveQual(raw)) {
      return {
        value: 'إيجابي',
        numericValue: null,
        displayValue: 'إيجابي',
        isMissing: false,
        qual: 'positive',
      };
    }
    if (isNegativeQual(raw)) {
      return {
        value: 'سلبي',
        numericValue: null,
        displayValue: 'سلبي',
        isMissing: false,
        qual: 'negative',
      };
    }
    return {
      value: raw,
      numericValue: null,
      displayValue: raw,
      isMissing: false,
      qual: null,
    };
  }

  if (valueType === VALUE_TYPES.TEXT) {
    return {
      value: raw,
      numericValue: null,
      displayValue: raw,
      isMissing: false,
      qual: null,
    };
  }

  const num = parseFloat(raw.replace(',', '.'));
  if (Number.isNaN(num)) {
    return {
      value: raw,
      numericValue: null,
      displayValue: raw,
      isMissing: false,
      qual: null,
    };
  }

  return {
    value: raw,
    numericValue: num,
    displayValue: formatNumber(num),
    isMissing: false,
    qual: null,
  };
};

const hasNumericReference = (range) => (
  range != null
  && range.min_value != null
  && range.max_value != null
);

const hasAnyReference = (range) => (
  hasNumericReference(range)
  || (range?.text_reference != null && String(range.text_reference).trim() !== '')
);

const resolveReferenceForResult = (result = {}, context = {}) => {
  if (context.referenceRange !== undefined) return context.referenceRange;
  const row = result.row || result;
  return refEngine.resolveReferenceRangeFromRow({
    row,
    legacyNotes: result.rv_notes,
  });
};

const mapEvaluatedFlag = (flagResult, { isMissing, hasReference, qual, valueType }) => {
  if (isMissing) {
    return { flag: RESULT_FLAGS.MISSING, isCritical: false, detailFlag: RESULT_FLAGS.MISSING };
  }

  if (valueType === VALUE_TYPES.QUAL) {
    if (qual === 'positive') {
      return { flag: RESULT_FLAGS.POS, isCritical: false, detailFlag: RESULT_FLAGS.POS };
    }
    if (qual === 'negative') {
      return { flag: RESULT_FLAGS.NEG, isCritical: false, detailFlag: RESULT_FLAGS.NEG };
    }
    return { flag: RESULT_FLAGS.NONE, isCritical: false, detailFlag: RESULT_FLAGS.NONE };
  }

  const rawFlag = flagResult?.flag ?? RESULT_FLAGS.NONE;
  const isCritical = Boolean(flagResult?.isCritical);

  if (rawFlag === 'CRIT_LOW' || rawFlag === 'CRIT_HIGH') {
    return { flag: RESULT_FLAGS.CRITICAL, isCritical: true, detailFlag: rawFlag };
  }

  if (rawFlag === 'HIGH' || rawFlag === 'LOW' || rawFlag === 'NORMAL') {
    return { flag: rawFlag, isCritical, detailFlag: rawFlag };
  }

  if (!hasReference) {
    return {
      flag: RESULT_FLAGS.NORMAL_WITHOUT_REF,
      isCritical: false,
      detailFlag: RESULT_FLAGS.NORMAL_WITHOUT_REF,
    };
  }

  return { flag: RESULT_FLAGS.NONE, isCritical: false, detailFlag: RESULT_FLAGS.NONE };
};

/**
 * Evaluate one result row — value, unit, reference, flag (never from rv_notes bounds).
 */
const evaluateResult = (result = {}, context = {}) => {
  const valueType = inferValueType(result, context);
  const normalized = normalizeResultValue(
    result.value ?? result.numeric_value,
    valueType
  );
  const referenceRange = resolveReferenceForResult(result, context);
  const reference = refEngine.formatReferenceRange(referenceRange) || null;
  const hasReference = hasAnyReference(referenceRange);

  if (normalized.isMissing) {
    return {
      ...normalized,
      valueType,
      unit: result.unit ?? context.unit ?? null,
      reference,
      referenceRange,
      hasReference,
      ...mapEvaluatedFlag(null, {
        isMissing: true,
        hasReference,
        qual: null,
        valueType,
      }),
    };
  }

  if (valueType === VALUE_TYPES.QUAL) {
    return {
      ...normalized,
      valueType,
      unit: result.unit ?? context.unit ?? null,
      reference,
      referenceRange,
      hasReference,
      ...mapEvaluatedFlag(null, {
        isMissing: false,
        hasReference,
        qual: normalized.qual,
        valueType,
      }),
    };
  }

  if (normalized.numericValue != null && hasNumericReference(referenceRange)) {
    const flagResult = refEngine.evaluateResultFlag(normalized.numericValue, referenceRange);
    return {
      ...normalized,
      valueType,
      unit: result.unit ?? context.unit ?? null,
      reference,
      referenceRange,
      hasReference,
      ...mapEvaluatedFlag(flagResult, {
        isMissing: false,
        hasReference: true,
        qual: null,
        valueType,
      }),
    };
  }

  if (normalized.numericValue != null) {
    return {
      ...normalized,
      valueType,
      unit: result.unit ?? context.unit ?? null,
      reference,
      referenceRange,
      hasReference: false,
      ...mapEvaluatedFlag({ flag: '', isCritical: false }, {
        isMissing: false,
        hasReference: false,
        qual: null,
        valueType,
      }),
    };
  }

  return {
    ...normalized,
    valueType,
    unit: result.unit ?? context.unit ?? null,
    reference,
    referenceRange,
    hasReference,
    flag: RESULT_FLAGS.NONE,
    isCritical: false,
    detailFlag: RESULT_FLAGS.NONE,
  };
};

const qualDisplayLabel = (displayValue, flag, isArabic) => {
  if (flag === RESULT_FLAGS.POS || flag === 'POS') return isArabic ? 'إيجابي' : 'Positive';
  if (flag === RESULT_FLAGS.NEG || flag === 'NEG') return isArabic ? 'سلبي' : 'Negative';
  return displayValue;
};

const reportFlagFromEvaluation = (evaluated) => flagForReport(evaluated);

/**
 * Build one report result object (same shape as reports.service — PDF design unchanged).
 */
const buildReportResultRow = (row = {}, context = {}) => {
  const isArabic = context.language === 'ar' || context.isArabic;
  const displayCtx = context.displayContext || {};
  const evaluated = evaluateResult(row, {
    ...context,
    value_type: displayCtx.valueTypeMap?.[row.parameter_id] || context.value_type,
  });
  const panelRow = getNormaPanelRow(row.parameter_code);
  const refRange = evaluated.referenceRange;
  const instrument = context.instrumentResolver
    ? context.instrumentResolver(row.category_code, row.test_code)
    : (context.instrument || '');

  const displayNum = formatNumber(evaluated.numericValue ?? evaluated.displayValue ?? row.value);
  const deviceCode = resolveDisplayCode({
    parameterId: row.parameter_id,
    parameterCode: row.parameter_code,
    deviceCode: row.device_code,
    shortCode: row.short_code,
    deviceCodeMap: displayCtx.deviceCodeMap || {},
  });

  const nameAr = resolveDisplayNameAr({
    parameterId: row.parameter_id,
    parameterNameAr: panelRow?.name_ar || row.parameter_name_ar,
    parameterName: row.parameter_name || row.test_name_ar || row.test_name,
    displayNameArMap: displayCtx.displayNameArMap || {},
  });

  const nameEn = resolveDisplayNameEn({
    parameterId: row.parameter_id,
    parameterName: panelRow?.symbol || row.parameter_name || row.test_name,
    displayNameEnMap: displayCtx.displayNameEnMap || {},
  });

  return {
    code: deviceCode || row.parameter_code,
    deviceCode: deviceCode || row.parameter_code,
    systemCode: row.parameter_code,
    testCode: row.test_code,
    nameAr,
    nameEn,
    testNameAr: row.test_name_ar || row.test_name,
    testNameEn: row.test_name,
    value: qualDisplayLabel(displayNum ?? (isArabic ? '—' : 'N/A'), evaluated.flag, isArabic),
    numericValue: evaluated.numericValue,
    unit: row.unit && row.unit !== 'qual' ? row.unit : (isArabic ? '—' : 'N/A'),
    minValue: refRange?.min_value ?? null,
    maxValue: refRange?.max_value ?? null,
    reference: formatReferenceForReport(evaluated.reference, evaluated.hasReference, isArabic),
    hasReference: evaluated.hasReference,
    flag: reportFlagFromEvaluation(evaluated),
    isCritical: evaluated.hasReference ? evaluated.isCritical : false,
    method: row.test_method || '',
    instrument,
    categoryCode: row.category_code || null,
  };
};

/**
 * Pre-approval validation — missing ≠ low; notes ≠ reference bounds.
 */
const validateResultBeforeApproval = (result = {}, context = {}) => {
  const evaluated = evaluateResult(result, context);
  const errors = [];
  const warnings = [];

  if (evaluated.isMissing) {
    warnings.push('Value is missing');
  }

  if (evaluated.flag === RESULT_FLAGS.MISSING && evaluated.flag === RESULT_FLAGS.LOW) {
    errors.push('Missing value must not be flagged as LOW');
  }

  const code = result.parameter_code || context.parameter_code;
  if (code && mappingEngine.NORMA_CBC_VALUE_TYPES[code] && evaluated.numericValue != null) {
    const expected = mappingEngine.NORMA_CBC_VALUE_TYPES[code];
    if (evaluated.valueType !== expected) {
      errors.push(`value_type mismatch for ${code}: expected ${expected}, got ${evaluated.valueType}`);
    }
  }

  if (evaluated.isMissing && (evaluated.flag === RESULT_FLAGS.LOW || evaluated.flag === RESULT_FLAGS.HIGH)) {
    errors.push('Missing value must not produce HIGH/LOW flag');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    evaluated,
  };
};

module.exports = {
  VALUE_TYPES,
  RESULT_FLAGS,
  inferValueType,
  normalizeResultValue,
  evaluateResult,
  buildReportResultRow,
  validateResultBeforeApproval,
  formatNumber,
  qualDisplayLabel,
  isPositiveQual,
  isNegativeQual,
};
