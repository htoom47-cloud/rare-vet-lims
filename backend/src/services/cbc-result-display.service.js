const {
  DEFAULT_CBC_TEST_CODE,
  mapCbcRowsForDisplay,
  NORMA_CBC_PCT_BY_ABS,
} = require('../utils/norma-cbc-map');
const { query } = require('../config/database');
const { getLimsReferenceRange } = require('./reference-ranges.service');
const { cbcPctFallbackAbsCode, isPercentLikeRange, isSyncedNotes } = require('../utils/cbc-reference-params');
const resultEngine = require('./result-engine.service');

const CBC_PCT_CODES = new Set(Object.values(NORMA_CBC_PCT_BY_ABS));

const hasResolvedReference = (row) => {
  if (row.reference) return true;
  if (row.trr_min != null && row.trr_max != null) return true;
  if (row.trr_text_reference != null && String(row.trr_text_reference).trim() !== '') return true;
  return false;
};

const reevaluateRowWithRange = (row, range) => {
  const evaluated = resultEngine.evaluateResult(
    { value: row.value, unit: row.unit, parameter_code: row.parameter_code },
    {
      referenceRange: {
        source: 'lims',
        min_value: range.min_value,
        max_value: range.max_value,
        critical_low: range.critical_low,
        critical_high: range.critical_high,
        text_reference: range.text_reference,
        notes: range.notes,
      },
    }
  );
  const storeFlag = evaluated.flag === resultEngine.RESULT_FLAGS.CRITICAL
    ? (evaluated.detailFlag || resultEngine.RESULT_FLAGS.CRIT_HIGH)
    : (evaluated.detailFlag || evaluated.flag || '');
  return {
    ...row,
    reference: evaluated.reference || row.reference,
    flag: storeFlag || row.flag,
    is_critical: evaluated.isCritical ?? row.is_critical,
    trr_min: range.min_value,
    trr_max: range.max_value,
    trr_critical_low: range.critical_low,
    trr_critical_high: range.critical_high,
    trr_notes: range.notes,
    trr_text_reference: range.text_reference,
    trr_unit: range.unit,
  };
};

/** Fill missing CBC references (LYM_PCT, RDW-SD, …) from LIMS + misplaced abs % fallback. */
const enrichCbcReferences = async (rows, { animal_type, gender, age }) => {
  const needsRef = rows.filter((r) => !hasResolvedReference(r));
  if (!needsRef.length || !animal_type) return rows;

  const codes = [...new Set(needsRef.map((r) => r.parameter_code))];
  const absCodes = [...new Set(codes.map((c) => cbcPctFallbackAbsCode(c)).filter(Boolean))];
  const allCodes = [...new Set([...codes, ...absCodes])];
  const paramResult = await query(
    `SELECT tp.id, tp.code FROM test_parameters tp
     JOIN tests t ON tp.test_id = t.id
     WHERE t.code = $1 AND tp.code = ANY($2)`,
    [DEFAULT_CBC_TEST_CODE, allCodes]
  );
  const paramIdByCode = Object.fromEntries(paramResult.rows.map((p) => [p.code, p.id]));

  return Promise.all(rows.map(async (row) => {
    if (hasResolvedReference(row)) return row;
    const parameterId = paramIdByCode[row.parameter_code] || row.parameter_id;
    let range = parameterId
      ? await getLimsReferenceRange(parameterId, animal_type, { sex: gender, age })
      : null;

    if (!range || (range.min_value == null && range.max_value == null)) {
      const absCode = cbcPctFallbackAbsCode(row.parameter_code);
      const absParamId = absCode ? paramIdByCode[absCode] : null;
      if (absParamId) {
        const absRange = await getLimsReferenceRange(absParamId, animal_type, { sex: gender, age });
        if (absRange && !isSyncedNotes(absRange.notes)) {
          range = absRange;
        } else if (absRange && isPercentLikeRange(absRange.min_value, absRange.max_value, absRange.unit)) {
          range = absRange;
        }
      }
    }

    if (!range) return row;
    return reevaluateRowWithRange({ ...row, parameter_id: parameterId || row.parameter_id }, range);
  }));
};

/** @deprecated use enrichCbcReferences */
const enrichCbcPctReferences = enrichCbcReferences;

/**
 * Norma CBC screen rows for reports/PDF — same reference logic as workbench.
 */
const buildCbcReportRowsFromSql = async (sqlRows, context) => {
  if (!sqlRows?.length) return [];
  const meta = sqlRows[0];
  const withRef = sqlRows.map((row) => ({
    ...row,
    reference: resultEngine.evaluateResult(row).reference || null,
  }));
  let display = mapRawRowsToCbcDisplay(withRef);
  display = await enrichCbcReferences(display, context);
  const byCode = Object.fromEntries(withRef.map((r) => [r.parameter_code, r]));
  return display.map((d) => {
    const src = byCode[d.parameter_code]
      || byCode[cbcPctFallbackAbsCode(d.parameter_code)]
      || {};
    return {
      ...meta,
      parameter_id: d.parameter_id,
      parameter_code: d.parameter_code,
      parameter_name: d.parameter_name,
      parameter_name_ar: d.parameter_name_ar,
      value: d.value,
      numeric_value: d.numeric_value,
      unit: d.unit,
      flag: d.flag,
      is_critical: d.is_critical,
      sort_order: d.sort_order,
      trr_min: d.trr_min ?? src.trr_min ?? null,
      trr_max: d.trr_max ?? src.trr_max ?? null,
      trr_critical_low: d.trr_critical_low ?? src.trr_critical_low ?? null,
      trr_critical_high: d.trr_critical_high ?? src.trr_critical_high ?? null,
      trr_notes: d.trr_notes ?? src.trr_notes ?? null,
      trr_text_reference: d.trr_text_reference ?? src.trr_text_reference ?? null,
      trr_unit: d.trr_unit ?? src.trr_unit ?? null,
    };
  });
};

const mapRawRowsToCbcDisplay = (rawRows) => mapCbcRowsForDisplay(rawRows);

module.exports = {
  mapRawRowsToCbcDisplay,
  enrichCbcPctReferences,
  enrichCbcReferences,
  buildCbcReportRowsFromSql,
  reevaluateRowWithRange,
  hasResolvedReference,
};
