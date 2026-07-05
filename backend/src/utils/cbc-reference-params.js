/**
 * CBC reference range parameter alignment — WBC differential % uses *_PCT codes.
 */
const { NORMA_CBC_PCT_BY_ABS, NORMA_CBC_SCREEN_ORDER, getNormaPanelRow } = require('./norma-cbc-panel');

const PCT_BY_ABS = { ...NORMA_CBC_PCT_BY_ABS };
const ABS_BY_PCT = Object.fromEntries(Object.entries(PCT_BY_ABS).map(([abs, pct]) => [pct, abs]));

const SYNCED_NOTE_PREFIXES = ['Synced from', 'Norma:'];

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

module.exports = {
  PCT_BY_ABS,
  ABS_BY_PCT,
  CBC_ABS_DIFF_CODES,
  NORMA_CBC_SCREEN_ORDER,
  isSyncedNotes,
  isPercentLikeRange,
  cbcReferenceDisplayCode,
  cbcScreenDataCode,
  cbcPctFallbackAbsCode,
};
