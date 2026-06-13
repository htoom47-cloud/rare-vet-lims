// Norma iVet / Icon CBC parameter codes → LIMS test_parameters.code
const NORMA_CBC_MAP = {
  WBC: 'WBC', 'WBC#': 'WBC', 'WBC%': 'WBC',
  LYM: 'LYM', 'LYM#': 'LYM', 'LYM%': 'LYM',
  MON: 'MON', 'MON#': 'MON', 'MON%': 'MON',
  NEU: 'NEU', 'NEU#': 'NEU', 'NEU%': 'NEU', GRAN: 'NEU', 'GRAN#': 'NEU', 'GRAN%': 'NEU',
  EOS: 'EOS', 'EOS#': 'EOS', 'EOS%': 'EOS',
  BAS: 'BAS', 'BAS#': 'BAS', 'BAS%': 'BAS',
  RBC: 'RBC', 'RBC#': 'RBC',
  HGB: 'HGB', HGB: 'HGB', HB: 'HGB',
  HCT: 'HCT', HCT: 'HCT', HCT_PCT: 'HCT',
  MCV: 'MCV',
  MCH: 'MCH',
  MCHC: 'MCHC',
  PLT: 'PLT', 'PLT#': 'PLT', PLT: 'PLT',
  MPV: 'MPV',
  RDW: 'RDW', 'RDW-CV': 'RDW', 'RDW-SD': 'RDW', RDWCV: 'RDW', RDWSD: 'RDW',
  'RDWsd': 'RDW', 'RDWcv': 'RDW',
  PCT: 'PCT', PDW: 'PDW', 'PDW-CV': 'PDW', 'PDW-SD': 'PDW', PDWSD: 'PDW', PDWCV: 'PDW',
  'PDWsd': 'PDW', 'PDWcv': 'PDW',
  'PLC-R': 'PLC-R', 'PLC-C': 'PLC-C',
};

const DEFAULT_CBC_TEST_CODE = 'CBC-FULL';

// Norma iVet screen layout: WBC block → RBC block → PLT block
const NORMA_CBC_ORDER = [
  'WBC', 'LYM', 'MON', 'NEU', 'EOS', 'BAS',
  'RBC', 'HGB', 'MCV', 'HCT', 'MCH', 'MCHC', 'RDW',
  'PLT', 'MPV', 'PCT', 'PDW', 'PLC-R', 'PLC-C',
];

const NORMA_CBC_SORT_INDEX = Object.fromEntries(
  NORMA_CBC_ORDER.map((code, index) => [code, index])
);

function mapNormaCode(deviceCode) {
  if (!deviceCode) return null;
  const normalized = deviceCode.trim().toUpperCase();
  return NORMA_CBC_MAP[normalized] || NORMA_CBC_MAP[deviceCode.trim()] || normalized;
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
  return (a.parameterId ?? a.parameter_id ?? 0) - (b.parameterId ?? b.parameter_id ?? 0);
}

module.exports = {
  NORMA_CBC_MAP,
  NORMA_CBC_ORDER,
  DEFAULT_CBC_TEST_CODE,
  mapNormaCode,
  normaSortIndex,
  compareByNormaOrder,
};
