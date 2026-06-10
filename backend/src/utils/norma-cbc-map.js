// Norma iVet / Icon CBC parameter codes → LIMS test_parameters.code
const NORMA_CBC_MAP = {
  WBC: 'WBC',
  LYM: 'LYM',
  MON: 'MON',
  NEU: 'NEU',
  EOS: 'EOS',
  BAS: 'BAS',
  'LYM%': 'LYM_PCT',
  'MON%': 'MON_PCT',
  'NEU%': 'NEU_PCT',
  'EOS%': 'EOS_PCT',
  'BAS%': 'BAS_PCT',
  RBC: 'RBC',
  HGB: 'HGB',
  HCT: 'HCT',
  MCV: 'MCV',
  MCH: 'MCH',
  MCHC: 'MCHC',
  PLT: 'PLT',
  MPV: 'MPV',
  RDW: 'RDW',
  'RDW-CV': 'RDW',
  'RDW-SD': 'RDW',
};

const DEFAULT_CBC_TEST_CODE = 'CBC-FULL';

function mapNormaCode(deviceCode) {
  if (!deviceCode) return null;
  const normalized = deviceCode.trim().toUpperCase();
  return NORMA_CBC_MAP[normalized] || NORMA_CBC_MAP[deviceCode.trim()] || normalized;
}

module.exports = { NORMA_CBC_MAP, DEFAULT_CBC_TEST_CODE, mapNormaCode };
