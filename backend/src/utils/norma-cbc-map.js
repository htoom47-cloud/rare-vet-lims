// Norma iVet / Icon CBC parameter codes → LIMS test_parameters.code
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
  'RDWSD': 'RDW-SD', 'RDWCV': 'RDW-CV',
  'PDWSD': 'PDW-SD', 'PDWCV': 'PDW-CV',
  HGB: 'HGB', HGB: 'HGB', HB: 'HGB',
  HCT: 'HCT', HCT: 'HCT', HCT_PCT: 'HCT',
  MCV: 'MCV',
  MCH: 'MCH',
  MCHC: 'MCHC',
  PLT: 'PLT', 'PLT#': 'PLT', PLT: 'PLT',
  MPV: 'MPV',
  RDW: 'RDW-CV', 'RDW-CV': 'RDW-CV', RDWCV: 'RDW-CV', 'RDWcv': 'RDW-CV',
  'RDW-SD': 'RDW-SD', RDWSD: 'RDW-SD', 'RDWsd': 'RDW-SD',
  PCT: 'PCT',
  PDW: 'PDW-CV', 'PDW-CV': 'PDW-CV', PDWCV: 'PDW-CV', 'PDWcv': 'PDW-CV',
  'PDW-SD': 'PDW-SD', PDWSD: 'PDW-SD', 'PDWsd': 'PDW-SD',
  'PLC-R': 'PLC-R', 'PLC-C': 'PLC-C',
};

const DEFAULT_CBC_TEST_CODE = 'CBC-FULL';

// Norma iVet-5 HL7 wire order (OBX-3 numeric index → parameter). Matches manufacturer panel order:
// WBC, LYM, MON, NEU, EOS, BAS, LYM%, MON%, NEU%, BAS%, RBC, HGB, HCT, MCV, RDWsd, RDWcv, MCH, MCHC, PLT, MPV, PCT, PDWsd, PDWcv, PLC-R, PLC-C
const NORMA_IVET_HL7_INDEX = [
  'WBC', 'LYM', 'MON', 'NEU', 'EOS', 'BAS',
  'LYM_PCT', 'MON_PCT', 'NEU_PCT', 'EOS_PCT', 'BAS_PCT',
  'RBC', 'HGB', 'HCT', 'MCV', 'RDW-SD', 'RDW-CV', 'MCH', 'MCHC',
  'PLT', 'MPV', 'PCT', 'PDW-SD', 'PDW-CV', 'PLC-R', 'PLC-C',
];

// UI / report sort order (grouped abs + % per cell line)
const NORMA_CBC_ORDER = [
  'WBC', 'LYM', 'LYM_PCT', 'MON', 'MON_PCT', 'NEU', 'NEU_PCT', 'EOS', 'EOS_PCT', 'BAS', 'BAS_PCT',
  'RBC', 'HGB', 'MCV', 'HCT', 'MCH', 'MCHC', 'RDW-SD', 'RDW-CV',
  'PLT', 'MPV', 'PCT', 'PDW-SD', 'PDW-CV', 'PLC-R', 'PLC-C',
  'RDW',
];

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

module.exports = {
  NORMA_CBC_MAP,
  NORMA_CBC_ORDER,
  NORMA_IVET_HL7_INDEX,
  DEFAULT_CBC_TEST_CODE,
  mapNormaCode,
  mapNormaIndex,
  normaSortIndex,
  compareByNormaOrder,
};
