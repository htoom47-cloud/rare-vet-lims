/** Norma iVet-5 CBC screen — mirrors backend norma-cbc-panel.js (21 visible rows) */
export const NORMA_CBC_SECTIONS = ['WBC', 'RBC', 'PLT'];

/** WBC+5 diff %, RBC+7, PLT+6 — WBC differential shows % not absolute # */
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
  { code: 'WBC', symbol: 'WBC', section: 'WBC', unit: '10³/µL' },
  { code: 'LYM', symbol: 'LYM', section: 'WBC', unit: '10³/µL' },
  { code: 'MON', symbol: 'MON', section: 'WBC', unit: '10³/µL' },
  { code: 'NEU', symbol: 'NEU', section: 'WBC', unit: '10³/µL' },
  { code: 'EOS', symbol: 'EOS', section: 'WBC', unit: '10³/µL' },
  { code: 'BAS', symbol: 'BAS', section: 'WBC', unit: '10³/µL' },
  { code: 'LYM_PCT', symbol: 'LYM%', section: 'WBC', unit: '%' },
  { code: 'MON_PCT', symbol: 'MON%', section: 'WBC', unit: '%' },
  { code: 'NEU_PCT', symbol: 'NEU%', section: 'WBC', unit: '%' },
  { code: 'EOS_PCT', symbol: 'EOS%', section: 'WBC', unit: '%' },
  { code: 'BAS_PCT', symbol: 'BAS%', section: 'WBC', unit: '%' },
  { code: 'RBC', symbol: 'RBC', section: 'RBC', unit: '10⁶/µL' },
  { code: 'HGB', symbol: 'HGB', section: 'RBC', unit: 'g/L' },
  { code: 'MCV', symbol: 'MCV', section: 'RBC', unit: 'fL' },
  { code: 'HCT', symbol: 'HCT', section: 'RBC', unit: '%' },
  { code: 'MCH', symbol: 'MCH', section: 'RBC', unit: 'pg' },
  { code: 'MCHC', symbol: 'MCHC', section: 'RBC', unit: 'g/L' },
  { code: 'RDW-SD', symbol: 'RDWsd', section: 'RBC', unit: 'fL' },
  { code: 'RDW-CV', symbol: 'RDWcv', section: 'RBC', unit: '%' },
  { code: 'PLT', symbol: 'PLT', section: 'PLT', unit: '10³/µL' },
  { code: 'MPV', symbol: 'MPV', section: 'PLT', unit: 'fL' },
  { code: 'PCT', symbol: 'PCT', section: 'PLT', unit: '%' },
  { code: 'PDW-SD', symbol: 'PDWsd', section: 'PLT', unit: 'fL' },
  { code: 'PDW-CV', symbol: 'PDWcv', section: 'PLT', unit: '%' },
  { code: 'PLC-R', symbol: 'PLC-R', section: 'PLT', unit: '%' },
  { code: 'PLC-C', symbol: 'PLC-C', section: 'PLT', unit: '10³/µL' },
];

const PANEL_BY_CODE = Object.fromEntries(NORMA_CBC_PANEL.map((p) => [p.code, p]));

export const normaSectionLabel = (section, t) => {
  const key = { WBC: 'workbench.normaSectionWbc', RBC: 'workbench.normaSectionRbc', PLT: 'workbench.normaSectionPlt' }[section];
  return key ? t(key) : section;
};

export const isNormaCbcTest = (test) => test?.test_code === 'CBC-FULL' || test?.code === 'CBC-FULL';

const valueFrom = (param, valuesByParam) => (param?.id ? valuesByParam.get(param.id) : null);

function resolveCbcScreenField(screenCode, byCode, valuesByParam) {
  const pctCode = NORMA_CBC_PCT_BY_ABS[screenCode];
  const screenMeta = PANEL_BY_CODE[screenCode] || { symbol: screenCode, section: null };
  const absParam = byCode[screenCode];
  const pctParam = pctCode ? byCode[pctCode] : null;
  const absVal = valueFrom(absParam, valuesByParam);
  const pctVal = valueFrom(pctParam, valuesByParam);

  if (pctCode) {
    const pctMeta = PANEL_BY_CODE[pctCode] || { symbol: `${screenCode}%`, section: 'WBC', unit: '%' };
    const pctText = String(pctVal?.value ?? '').trim();
    if (pctText !== '') {
      return {
        parameter_id: pctParam?.id || null,
        code: pctCode,
        name: pctMeta.symbol,
        unit: '%',
        norma_section: screenMeta.section,
        value: pctVal.value,
        flag: pctVal?.flag,
        reference: pctVal?.reference || '',
        missing_in_db: !pctParam,
      };
    }
    const wbc = parseFloat(valuesByParam.get(byCode.WBC?.id)?.value);
    const abs = parseFloat(absVal?.value);
    if (!Number.isNaN(wbc) && wbc > 0 && !Number.isNaN(abs)) {
      const computed = Math.round((abs / wbc * 100) * 10) / 10;
      return {
        parameter_id: pctParam?.id || absParam?.id || null,
        code: pctCode,
        name: pctMeta.symbol,
        unit: '%',
        norma_section: screenMeta.section,
        value: String(computed),
        flag: pctVal?.flag || absVal?.flag,
        reference: pctVal?.reference || '',
        missing_in_db: !pctParam,
      };
    }
    return null;
  }

  const p = realmParam(screenCode, absParam, screenMeta);
  if (!p.id && !absVal) return null;
  return {
    parameter_id: p.id,
    code: screenCode,
    name: p.norma_symbol || screenMeta.symbol,
    unit: p.unit || screenMeta.unit,
    norma_section: screenMeta.section,
    value: absVal?.value || '',
    flag: absVal?.flag,
    reference: absVal?.reference || '',
    missing_in_db: p.missing_in_db,
  };
}

export const buildCbcResultFields = (apiParameters = [], existing = null) => {
  const byCode = Object.fromEntries((apiParameters || []).map((p) => [p.code, p]));
  const valuesByParam = new Map((existing?.values || []).map((v) => [v.parameter_id, v]));

  return NORMA_CBC_SCREEN_ORDER
    .map((code) => resolveCbcScreenField(code, byCode, valuesByParam))
    .filter(Boolean);
};

function realmParam(code, p, meta) {
  if (p) return p;
  return {
    id: null,
    code,
    norma_symbol: meta.symbol,
    norma_section: meta.section,
    unit: meta.unit || null,
    missing_in_db: true,
  };
}

export const sectionRowCount = (section) => {
  if (section === 'WBC') return 6;
  if (section === 'RBC') return 8;
  if (section === 'PLT') return 7;
  return NORMA_CBC_PANEL.filter((p) => p.section === section).length;
};
