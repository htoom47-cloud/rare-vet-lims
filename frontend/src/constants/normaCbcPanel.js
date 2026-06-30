/** Norma iVet-5 CBC screen — mirrors backend norma-cbc-panel.js (21 visible rows) */
export const NORMA_CBC_SECTIONS = ['WBC', 'RBC', 'PLT'];

/** WBC+5, RBC+7, PLT+6 — percentages shown inline on diff rows, not as separate fields */
export const NORMA_CBC_SCREEN_ORDER = [
  'WBC', 'LYM', 'MON', 'NEU', 'EOS', 'BAS',
  'RBC', 'HGB', 'MCV', 'HCT', 'MCH', 'MCHC', 'RDW-SD', 'RDW-CV',
  'PLT', 'MPV', 'PCT', 'PDW-SD', 'PDW-CV', 'PLC-R', 'PLC-C',
];

export const NORMA_CBC_PCT_BY_ABS = {
  LYM: 'LYM_PCT',
  MON: 'MON_PCT',
  NEU: 'NEU_PCT',
  EOS: 'EOS_PCT',
  BAS: 'BAS_PCT',
};

export const NORMA_CBC_PANEL = [
  { code: 'WBC', symbol: 'WBC', section: 'WBC' },
  { code: 'LYM', symbol: 'LYM', section: 'WBC' },
  { code: 'MON', symbol: 'MON', section: 'WBC' },
  { code: 'NEU', symbol: 'NEU', section: 'WBC' },
  { code: 'EOS', symbol: 'EOS', section: 'WBC' },
  { code: 'BAS', symbol: 'BAS', section: 'WBC' },
  { code: 'RBC', symbol: 'RBC', section: 'RBC' },
  { code: 'HGB', symbol: 'HGB', section: 'RBC' },
  { code: 'MCV', symbol: 'MCV', section: 'RBC' },
  { code: 'HCT', symbol: 'HCT', section: 'RBC' },
  { code: 'MCH', symbol: 'MCH', section: 'RBC' },
  { code: 'MCHC', symbol: 'MCHC', section: 'RBC' },
  { code: 'RDW-SD', symbol: 'RDWsd', section: 'RBC' },
  { code: 'RDW-CV', symbol: 'RDWcv', section: 'RBC' },
  { code: 'PLT', symbol: 'PLT', section: 'PLT' },
  { code: 'MPV', symbol: 'MPV', section: 'PLT' },
  { code: 'PCT', symbol: 'PCT', section: 'PLT' },
  { code: 'PDW-SD', symbol: 'PDWsd', section: 'PLT' },
  { code: 'PDW-CV', symbol: 'PDWcv', section: 'PLT' },
  { code: 'PLC-R', symbol: 'PLC-R', section: 'PLT' },
  { code: 'PLC-C', symbol: 'PLC-C', section: 'PLT' },
];

const PANEL_BY_CODE = Object.fromEntries(NORMA_CBC_PANEL.map((p) => [p.code, p]));

export const normaSectionLabel = (section, t) => {
  const key = { WBC: 'workbench.normaSectionWbc', RBC: 'workbench.normaSectionRbc', PLT: 'workbench.normaSectionPlt' }[section];
  return key ? t(key) : section;
};

export const isNormaCbcTest = (test) => test?.test_code === 'CBC-FULL' || test?.code === 'CBC-FULL';

export const buildCbcResultFields = (apiParameters = [], existing = null) => {
  const byCode = Object.fromEntries((apiParameters || []).map((p) => [p.code, p]));
  const valuesByParam = new Map((existing?.values || []).map((v) => [v.parameter_id, v]));

  return NORMA_CBC_SCREEN_ORDER.map((code) => {
    const meta = PANEL_BY_CODE[code] || { symbol: code, section: null };
    const p = realmParam(code, byCode[code], meta);
    const val = p.id ? valuesByParam.get(p.id) : null;
    const pctCode = NORMA_CBC_PCT_BY_ABS[code];
    const pctParam = pctCode ? byCode[pctCode] : null;
    const pctVal = pctParam?.id ? valuesByParam.get(pctParam.id) : null;

    return {
      parameter_id: p.id,
      pct_parameter_id: pctParam?.id || null,
      code,
      name: p.norma_symbol || meta.symbol,
      unit: p.unit,
      norma_section: p.norma_section || meta.section,
      value: val?.value || '',
      flag: val?.flag,
      reference: val?.reference || '',
      pct_value: pctVal?.value || '',
      missing_in_db: p.missing_in_db,
    };
  });
};

function realmParam(code, p, meta) {
  if (p) return p;
  return {
    id: null,
    code,
    norma_symbol: meta.symbol,
    norma_section: meta.section,
    unit: null,
    missing_in_db: true,
  };
}

export const sectionRowCount = (section) => {
  if (section === 'WBC') return 6;
  if (section === 'RBC') return 8;
  if (section === 'PLT') return 7;
  return NORMA_CBC_PANEL.filter((p) => p.section === section).length;
};
