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
  PCT: 'MPV', PDW: 'MPV', 'PDW-CV': 'MPV', 'PDW-SD': 'MPV',
};

const DEFAULT_CBC_TEST_CODE = 'CBC-FULL';

function mapNormaCode(deviceCode) {
  if (!deviceCode) return null;
  const normalized = deviceCode.trim().toUpperCase();
  return NORMA_CBC_MAP[normalized] || NORMA_CBC_MAP[deviceCode.trim()] || normalized;
}

module.exports = { NORMA_CBC_MAP, DEFAULT_CBC_TEST_CODE, mapNormaCode };
