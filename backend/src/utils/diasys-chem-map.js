/**
 * DiaSys Respons 910 chemistry analyzer → LIMS CHEM-BASIC parameter codes.
 * Used by setup-diasys-device.js and mapping-engine fallback.
 * Does not alter Norma/CBC or Mindray mappings.
 */
const DIASYS_DEVICE_NAME = 'Diasys Respons 910';
const DIASYS_TEST_CODE = 'CHEM-BASIC';
const DIASYS_DEFAULT_HOST = '192.168.1.27';
const DIASYS_DEFAULT_PORT = 6669;

/** [device_parameter_code, lims_parameter_code, value_type] */
const DIASYS_CHEM_MAPPINGS = [
  ['GLU', 'GLU', 'numeric'],
  ['GLUC', 'GLU', 'numeric'],
  ['GLUCOSE', 'GLU', 'numeric'],
  ['GLU-HK', 'GLU', 'numeric'],
  ['GLUC GOD', 'GLU', 'numeric'],
  ['GLUCGOD', 'GLU', 'numeric'],
  ['GOD', 'GLU', 'numeric'],
  // Respons sends urea as internal method 054 (mg/dL), not "UREA".
  ['054', 'BUN', 'numeric'],
  ['UREA', 'BUN', 'numeric'],
  ['URE', 'BUN', 'numeric'],
  ['UR', 'BUN', 'numeric'],
  ['BUN', 'BUN', 'numeric'],
  ['UREA-UV', 'BUN', 'numeric'],
  ['UREA-N', 'BUN', 'numeric'],
  ['UREAN', 'BUN', 'numeric'],
  ['CREA', 'CREA', 'numeric'],
  ['CREAJ', 'CREA', 'numeric'],
  ['CREA-J', 'CREA', 'numeric'],
  ['CRE', 'CREA', 'numeric'],
  ['CREAT', 'CREA', 'numeric'],
  ['CREATININE', 'CREA', 'numeric'],
  ['CREA-PAP', 'CREA', 'numeric'],
  ['ALT', 'ALT', 'numeric'],
  ['ALAT', 'ALT', 'numeric'],
  ['GPT', 'ALT', 'numeric'],
  ['SGPT', 'ALT', 'numeric'],
  ['AST', 'AST', 'numeric'],
  ['ASAT', 'AST', 'numeric'],
  ['GOT', 'AST', 'numeric'],
  ['SGOT', 'AST', 'numeric'],
  ['ALP', 'ALP', 'numeric'],
  ['AP', 'ALP', 'numeric'],
  ['ALKP', 'ALP', 'numeric'],
  ['TP', 'TP', 'numeric'],
  ['T.P', 'TP', 'numeric'],
  ['TP-C', 'TP', 'numeric'],
  ['TOTAL PROTEIN', 'TP', 'numeric'],
  ['ALB', 'ALB', 'numeric'],
  ['ALBUMIN', 'ALB', 'numeric'],
  ['GGT', 'GGT', 'numeric'],
  ['GAMMA-GT', 'GGT', 'numeric'],
  ['G-GT', 'GGT', 'numeric'],
  ['TBIL', 'TBIL', 'numeric'],
  ['BIL-T', 'TBIL', 'numeric'],
  ['BILT', 'TBIL', 'numeric'],
  ['TBILI', 'TBIL', 'numeric'],
  ['T.BILI', 'TBIL', 'numeric'],
  ['BILI', 'TBIL', 'numeric'],
  ['LDH', 'LDH', 'numeric'],
  ['LDH21', 'LDH', 'numeric'],
  ['LDH-21', 'LDH', 'numeric'],
  ['CHE', 'CHE', 'numeric'],
  ['CHOLINESTERASE', 'CHE', 'numeric'],
  ['CO2', 'CO2', 'numeric'],
  ['HCO3', 'CO2', 'numeric'],
  ['NEFA', 'NEFA', 'numeric'],
  ['UA', 'UA', 'numeric'],
  ['URIC', 'UA', 'numeric'],
  ['URIC ACID', 'UA', 'numeric'],
  ['CK', 'CK', 'numeric'],
  ['CK-NAC', 'CK', 'numeric'],
  ['FE', 'Fe', 'numeric'],
  ['IRON', 'Fe', 'numeric'],
  ['PHOS', 'phos', 'numeric'],
  ['PHOSPHORUS', 'phos', 'numeric'],
  ['IP', 'phos', 'numeric'],
  ['P', 'phos', 'numeric'],
  ['CA', 'Ca', 'numeric'],
  ['CALCIUM', 'Ca', 'numeric'],
  ['MG', 'MG', 'numeric'],
  ['MAGNESIUM', 'MG', 'numeric'],
];

/** LIMS CHEM-BASIC params required for Diasys ingest (created if missing). */
const DIASYS_CHEM_PARAM_DEFS = [
  { code: 'MG', name: 'Magnesium', name_ar: 'المغنيسيوم', unit: 'mg/dL' },
  { code: 'TBIL', name: 'Total Bilirubin', name_ar: 'البيليروبين الكلي', unit: 'mg/dL' },
  { code: 'GGT', name: 'GGT', name_ar: 'GGT', unit: 'U/L' },
  { code: 'LDH', name: 'LDH', name_ar: 'LDH', unit: 'U/L' },
  { code: 'CHE', name: 'Cholinesterase', name_ar: 'الكولينستيراز', unit: 'U/L' },
  { code: 'CO2', name: 'CO2', name_ar: 'ثاني أكسيد الكربون', unit: 'mmol/L' },
  { code: 'NEFA', name: 'NEFA', name_ar: 'الأحماض الدهنية الحرة', unit: 'mmol/L' },
  { code: 'UA', name: 'Uric acid', name_ar: 'حمض اليوريك', unit: 'mg/dL' },
  { code: 'CK', name: 'CK', name_ar: 'CK', unit: 'U/L' },
  { code: 'Fe', name: 'Iron', name_ar: 'الحديد', unit: 'µg/dL' },
  { code: 'phos', name: 'Phosphorus', name_ar: 'الفوسفور', unit: 'mg/dL' },
  { code: 'Ca', name: 'Calcium', name_ar: 'الكالسيوم', unit: 'mg/dL' },
];

const DIASYS_CHEM_LIMS_BY_DEVICE = new Map();
for (const [deviceCode, limsCode] of DIASYS_CHEM_MAPPINGS) {
  DIASYS_CHEM_LIMS_BY_DEVICE.set(String(deviceCode).trim().toUpperCase(), limsCode);
}

function mapDiasysDeviceCodeToLims(deviceCode) {
  if (deviceCode == null || deviceCode === '') return null;
  return DIASYS_CHEM_LIMS_BY_DEVICE.get(String(deviceCode).trim().toUpperCase()) || null;
}

module.exports = {
  DIASYS_DEVICE_NAME,
  DIASYS_TEST_CODE,
  DIASYS_DEFAULT_HOST,
  DIASYS_DEFAULT_PORT,
  DIASYS_CHEM_MAPPINGS,
  DIASYS_CHEM_PARAM_DEFS,
  mapDiasysDeviceCodeToLims,
};
