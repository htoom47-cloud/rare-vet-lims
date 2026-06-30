// Norma iVet / Icon CBC parameter codes → LIMS test_parameters.code
const {
  NORMA_CBC_PANEL,
  NORMA_IVET_HL7_INDEX,
  NORMA_CBC_ORDER,
  NORMA_SYMBOL_BY_CODE,
  NORMA_SECTION_BY_CODE,
  getNormaPanelRow,
} = require('./norma-cbc-panel');

const NORMA_CBC_MAP = {
  WBC: 'WBC', 'WBC#': 'WBC', 'WBC%': 'WBC',
  LYM: 'LYM', 'LYM#': 'LYM', 'LYM%': 'LYM_PCT',
  MON: 'MON', 'MON#': 'MON', 'MON%': 'MON_PCT',
  NEU: 'NEU', 'NEU#': 'NEU', 'NEU%': 'NEU_PCT',
  GRAN: 'NEU', 'GRAN#': 'NEU', 'GRAN%': 'NEU_PCT',
  MID: 'MON', 'MID#': 'MON', 'MID%': 'MON_PCT',
  LYM_PCT: 'LYM_PCT', 'MONO%': 'MON_PCT', 'NEUT%': 'NEU_PCT', 'EOS%': 'EOS_PCT', 'BASO%': 'BAS_PCT',
  'Hemoglobin Conc.': 'HGB', 'Hemoglobin': 'HGB', Hemoglobin: 'HGB',
  Hematocrit: 'HCT', 'Platelet Count': 'PLT', 'Platelets': 'PLT',
  Lymphocytes: 'LYM', Monocytes: 'MON', Neutrophils: 'NEU', Eosinophils: 'EOS', Basophils: 'BAS',
  EOS: 'EOS', 'EOS#': 'EOS', 'EOS%': 'EOS_PCT',
  BAS: 'BAS', 'BAS#': 'BAS', 'BAS%': 'BAS_PCT',
  RBC: 'RBC', 'RBC#': 'RBC',
  RDWSD: 'RDW-SD', RDWCV: 'RDW-CV', PDWSD: 'PDW-SD', PDWCV: 'PDW-CV',
  HGB: 'HGB', HGB: 'HGB', HB: 'HGB',
  HCT: 'HCT', HCT: 'HCT', HCT_PCT: 'HCT',
  MCV: 'MCV', MCH: 'MCH', MCHC: 'MCHC',
  PLT: 'PLT', 'PLT#': 'PLT',
  MPV: 'MPV', PCT: 'PCT',
  RDW: 'RDW-CV', 'RDW-CV': 'RDW-CV', 'RDWcv': 'RDW-CV',
  'RDW-SD': 'RDW-SD', 'RDWsd': 'RDW-SD',
  PDW: 'PDW-CV', 'PDW-CV': 'PDW-CV', 'PDWcv': 'PDW-CV',
  'PDW-SD': 'PDW-SD', 'PDWsd': 'PDW-SD',
  'PLC-R': 'PLC-R', 'PLC-C': 'PLC-C',
};

const DEFAULT_CBC_TEST_CODE = 'CBC-FULL';

const NORMA_CBC_SORT_INDEX = Object.fromEntries(
  NORMA_CBC_ORDER.map((code, index) => [code, index])
);

function mapNormaIndex(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return NORMA_IVET_HL7_INDEX[index] || null;
}

function mapNormaCode(deviceCode) {
  if (deviceCode == null || deviceCode === '') return null;
  const raw = String(deviceCode).trim();
  if (/^\d+$/.test(raw)) {
    return mapNormaIndex(Number(raw));
  }
  const normalized = raw.toUpperCase();
  return NORMA_CBC_MAP[normalized] || NORMA_CBC_MAP[raw] || normalized;
}

function normaSortIndex(parameterCode) {
  if (!parameterCode) return Number.MAX_SAFE_INTEGER;
  const idx = NORMA_CBC_SORT_INDEX[parameterCode];
  return idx != null ? idx : Number.MAX_SAFE_INTEGER - 1;
}

function compareByNormaOrder(a, b) {
  const codeA = a.parameterCode || a.parameter_code || a.code;
  const codeB = b.parameterCode || b.parameter_code || b.code;
  const diff = normaSortIndex(codeA) - normaSortIndex(codeB);
  if (diff !== 0) return diff;
  const sortDiff = (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0);
  if (sortDiff !== 0) return sortDiff;
  return (a.parameterId ?? a.parameter_id ?? '').toString()
    .localeCompare((b.parameterId ?? b.parameter_id ?? '').toString());
}

function enrichCbcParameters(parameters = []) {
  return parameters.map((p) => {
    const row = getNormaPanelRow(p.code);
    if (!row) return p;
    return {
      ...p,
      norma_symbol: row.symbol,
      norma_section: row.section,
    };
  });
}

module.exports = {
  NORMA_CBC_MAP,
  NORMA_CBC_PANEL,
  NORMA_CBC_ORDER,
  NORMA_IVET_HL7_INDEX,
  NORMA_SYMBOL_BY_CODE,
  NORMA_SECTION_BY_CODE,
  DEFAULT_CBC_TEST_CODE,
  mapNormaCode,
  mapNormaIndex,
  normaSortIndex,
  compareByNormaOrder,
  enrichCbcParameters,
  getNormaPanelRow,
};
