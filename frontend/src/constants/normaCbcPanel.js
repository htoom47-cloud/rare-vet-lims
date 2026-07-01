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

const indexApiValues = (apiValues = []) => {
  const valuesByParam = new Map();
  const valuesByCode = new Map();
  for (const v of apiValues) {
    if (v?.parameter_id) valuesByParam.set(v.parameter_id, v);
    if (v?.parameter_code) valuesByCode.set(v.parameter_code, v);
  }
  return { valuesByParam, valuesByCode };
};

const valueFrom = (param, valuesByParam, valuesByCode, code) => {
  if (code && valuesByCode.has(code)) return valuesByCode.get(code);
  return param?.id ? valuesByParam.get(param.id) : null;
};

function resolveCbcScreenField(screenCode, byCode, valuesByParam, valuesByCode) {
  const pctCode = NORMA_CBC_PCT_BY_ABS[screenCode];
  const screenMeta = PANEL_BY_CODE[screenCode] || { symbol: screenCode, section: null };
  const absParam = byCode[screenCode];
  const pctParam = pctCode ? byCode[pctCode] : null;
  const absVal = valueFrom(absParam, valuesByParam, valuesByCode, screenCode);
  const pctVal = pctCode ? valueFrom(pctParam, valuesByParam, valuesByCode, pctCode) : null;

  if (pctCode) {
    const pctMeta = PANEL_BY_CODE[pctCode] || { symbol: `${screenCode}%`, section: 'WBC', unit: '%' };
    const pctText = String(pctVal?.value ?? '').trim();
    if (pctText !== '') {
      return {
        parameter_id: pctVal.parameter_id || pctParam?.id || null,
        code: pctCode,
        name: pctMeta.symbol,
        unit: '%',
        norma_section: screenMeta.section,
        value: pctVal.value,
        flag: pctVal?.flag,
        reference: pctVal?.reference || '',
        missing_in_db: !pctParam && !pctVal.parameter_id,
      };
    }
    const wbcRow = valuesByCode.get('WBC') || valueFrom(byCode.WBC, valuesByParam, valuesByCode, 'WBC');
    const wbc = parseFloat(wbcRow?.value);
    const abs = parseFloat(absVal?.value);
    if (!Number.isNaN(wbc) && wbc > 0 && !Number.isNaN(abs)) {
      const computed = Math.round((abs / wbc * 100) * 10) / 10;
      return {
        parameter_id: pctVal?.parameter_id || pctParam?.id || absVal?.parameter_id || absParam?.id || null,
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
  if (!absVal && !p.id) return null;
  return {
    parameter_id: absVal?.parameter_id || p.id,
    code: screenCode,
    name: p.norma_symbol || screenMeta.symbol,
    unit: absVal?.unit || p.unit || screenMeta.unit,
    norma_section: screenMeta.section,
    value: absVal?.value || '',
    flag: absVal?.flag,
    reference: absVal?.reference || '',
    missing_in_db: p.missing_in_db,
  };
}

const rowFromApiValue = (src, dataCode) => {
  const meta = PANEL_BY_CODE[dataCode] || {};
  return {
    parameter_id: src.parameter_id || null,
    code: dataCode,
    name: src.parameter_name || meta.symbol || dataCode,
    unit: src.unit || meta.unit,
    norma_section: src.norma_section || meta.section,
    value: src.value ?? '',
    flag: src.flag,
    reference: src.reference || '',
    missing_in_db: !src.parameter_id,
  };
};

export const buildCbcResultFields = (apiParameters = [], existing = null) => {
  const byCode = Object.fromEntries((apiParameters || []).map((p) => [p.code, p]));
  const apiValues = existing?.values || [];
  const { valuesByParam, valuesByCode } = indexApiValues(apiValues);

  if (apiValues.some((v) => v.norma_section && String(v.value ?? '').trim() !== '')) {
    return NORMA_CBC_SCREEN_ORDER.map((screenCode) => {
      const pctCode = NORMA_CBC_PCT_BY_ABS[screenCode];
      const dataCode = pctCode || screenCode;
      const src = valuesByCode.get(dataCode);
      if (src && String(src.value ?? '').trim() !== '') {
        return rowFromApiValue(src, dataCode);
      }
      return resolveCbcScreenField(screenCode, byCode, valuesByParam, valuesByCode);
    }).filter((row) => row && String(row.value ?? '').trim() !== '');
  }

  return NORMA_CBC_SCREEN_ORDER
    .map((code) => resolveCbcScreenField(code, byCode, valuesByParam, valuesByCode))
    .filter((row) => row && String(row.value ?? '').trim() !== '');
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
