/**
 * CBC reference range parameter alignment — WBC differential % uses *_PCT codes.
 */
const { NORMA_CBC_PCT_BY_ABS, NORMA_CBC_SCREEN_ORDER, getNormaPanelRow, NORMA_CBC_PANEL } = require('./norma-cbc-panel');

const PCT_BY_ABS = { ...NORMA_CBC_PCT_BY_ABS };
const ABS_BY_PCT = Object.fromEntries(Object.entries(PCT_BY_ABS).map(([abs, pct]) => [pct, abs]));

const SYNCED_NOTE_PREFIXES = ['Synced from', 'Norma:', 'Species default'];

const isSyncedNotes = (notes) => {
  const n = String(notes || '').trim();
  if (!n) return false;
  return SYNCED_NOTE_PREFIXES.some((p) => n.startsWith(p));
};

/** Range values typical of WBC differential % (not absolute 10³/µL counts). */
const isPercentLikeRange = (min, max, unit) => {
  if (String(unit || '').trim() === '%') return true;
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return false;
  // Absolute WBC diff counts are usually single digits; screen % rows are often ≥10 (LYM, NEU).
  if (lo >= 10 && hi <= 100) return true;
  return false;
};

/** Norma screen / report code for a stored parameter code. */
const cbcReferenceDisplayCode = (parameterCode) => {
  const panel = getNormaPanelRow(parameterCode);
  if (panel) return panel.symbol;
  const abs = ABS_BY_PCT[parameterCode];
  if (abs) {
    const pctPanel = getNormaPanelRow(parameterCode);
    return pctPanel?.symbol || `${abs}%`;
  }
  return parameterCode;
};

/** Parameter code used for CBC result display (screen row). */
const cbcScreenDataCode = (screenCode) => PCT_BY_ABS[screenCode] || screenCode;

/** When a % row lacks *_PCT range, allow fallback from misplaced manual range on abs code. */
const cbcPctFallbackAbsCode = (pctCode) => ABS_BY_PCT[pctCode] || null;

const CBC_ABS_DIFF_CODES = new Set(Object.keys(PCT_BY_ABS));

const CBC_PCT_CODES = new Set(Object.values(PCT_BY_ABS));

/** Resolve LIMS range: manual abs (#) wins over synced *_PCT for WBC differential %. */
const resolveCbcLimsRange = async (parameterCode, parameterId, context, paramIdByCode, getRange) => {
  const { animal_type, gender, age } = context;
  const extras = { sex: gender, age };
  const absCode = cbcPctFallbackAbsCode(parameterCode);

  if (absCode && CBC_PCT_CODES.has(parameterCode)) {
    const absId = paramIdByCode[absCode];
    if (absId) {
      const manualAbs = await getRange(absId, animal_type, extras);
      if (manualAbs?.min_value != null && manualAbs?.max_value != null && !isSyncedNotes(manualAbs.notes)) {
        return manualAbs;
      }
    }
  }

  const directId = paramIdByCode[parameterCode] || parameterId;
  if (directId) {
    const direct = await getRange(directId, animal_type, extras);
    if (direct && (direct.min_value != null || direct.text_reference)) return direct;
  }

  if (absCode && CBC_PCT_CODES.has(parameterCode)) {
    const absId = paramIdByCode[absCode];
    if (absId) {
      const absRange = await getRange(absId, animal_type, extras);
      if (absRange?.min_value != null && absRange?.max_value != null) return absRange;
    }
  }

  return null;
};

module.exports = {
  PCT_BY_ABS,
  ABS_BY_PCT,
  CBC_ABS_DIFF_CODES,
  CBC_PCT_CODES,
  NORMA_CBC_PANEL,
  NORMA_CBC_SCREEN_ORDER,
  isSyncedNotes,
  isPercentLikeRange,
  cbcReferenceDisplayCode,
  cbcScreenDataCode,
  cbcPctFallbackAbsCode,
  resolveCbcLimsRange,
};
