// Norma iVet / Icon CBC parameter codes → LIMS test_parameters.code
const {
  NORMA_CBC_PANEL,
  NORMA_IVET_HL7_INDEX,
  NORMA_CBC_ORDER,
  NORMA_CBC_SCREEN_ORDER,
  NORMA_CBC_PCT_BY_ABS,
  NORMA_CBC_UI_HIDDEN,
  NORMA_CBC_PANEL_CODES,
  NORMA_SYMBOL_BY_CODE,
  NORMA_SECTION_BY_CODE,
  getNormaPanelRow,
  buildCbcDisplayParameters,
  resolveCbcScreenRow,
  mapCbcRowsForDisplay,
  filterCbcReportRows,
} = require('./norma-cbc-panel');

const NORMA_CBC_MAP = {
  WBC: 'WBC', 'WBC#': 'WBC', 'WBC%': 'WBC',
  LYM: 'LYM', 'LYM#': 'LYM', 'LYM%': 'LYM_PCT', LYMP: 'LYM_PCT',
  MON: 'MON', 'MON#': 'MON', 'MON%': 'MON_PCT', MONP: 'MON_PCT',
  NEU: 'NEU', 'NEU#': 'NEU', 'NEU%': 'NEU_PCT', NEUP: 'NEU_PCT',
  GRAN: 'NEU', 'GRAN#': 'NEU', 'GRAN%': 'NEU_PCT',
  MID: 'MON', 'MID#': 'MON', 'MID%': 'MON_PCT',
  LYM_PCT: 'LYM_PCT', 'MONO%': 'MON_PCT', 'NEUT%': 'NEU_PCT', 'EOS%': 'EOS_PCT', 'BASO%': 'BAS_PCT',
  'Hemoglobin Conc.': 'HGB', 'Hemoglobin': 'HGB', Hemoglobin: 'HGB',
  Hematocrit: 'HCT', 'Platelet Count': 'PLT', 'Platelets': 'PLT',
  Lymphocytes: 'LYM', Monocytes: 'MON', Neutrophils: 'NEU', Eosinophils: 'EOS', Basophils: 'BAS',
  EOS: 'EOS', 'EOS#': 'EOS', 'EOS%': 'EOS_PCT', EOSP: 'EOS_PCT',
  BAS: 'BAS', 'BAS#': 'BAS', 'BAS%': 'BAS_PCT', BASP: 'BAS_PCT',
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
  'P-LCR': 'PLC-R', 'P-LCC': 'PLC-C',
  PLCR: 'PLC-R', PLCC: 'PLC-C',
  'Platelet Large Cell Ratio': 'PLC-R',
  'Platelet Large Cell Count': 'PLC-C',
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

/** Map Norma OBX row → LIMS parameter code (handles LYM + % → LYM_PCT). */
function resolveNormaResultLimsCode(row) {
  const fromCode = mapNormaCode(row?.code);
  const fromStored = row?.limsCode ? mapNormaCode(row.limsCode) : null;
  const base = fromCode || fromStored || row?.limsCode || null;
  if (!base) return null;
  const u = String(row?.unit || '').trim();
  const raw = String(row?.code || '').toUpperCase();
  if ((u === '%' || raw.includes('%')) && NORMA_CBC_PCT_BY_ABS[base]) {
    return NORMA_CBC_PCT_BY_ABS[base];
  }
  return base;
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
  NORMA_CBC_SCREEN_ORDER,
  NORMA_CBC_PCT_BY_ABS,
  NORMA_CBC_UI_HIDDEN,
  NORMA_CBC_PANEL_CODES,
  NORMA_IVET_HL7_INDEX,
  NORMA_SYMBOL_BY_CODE,
  NORMA_SECTION_BY_CODE,
  DEFAULT_CBC_TEST_CODE,
  mapNormaCode,
  mapNormaIndex,
  resolveNormaResultLimsCode,
  normaSortIndex,
  compareByNormaOrder,
  enrichCbcParameters,
  getNormaPanelRow,
  buildCbcDisplayParameters,
  resolveCbcScreenRow,
  mapCbcRowsForDisplay,
  filterCbcReportRows,
};
