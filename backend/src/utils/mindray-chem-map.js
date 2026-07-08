/**
 * Mindray BS-120 chemistry analyzer → LIMS CHEM-BASIC parameter codes.
 * Used by setup-mindray-device.js only — does not alter Norma/CBC mapping.
 */
const MINDRAY_DEVICE_NAME = 'Mindray BS-120';
const MINDRAY_TEST_CODE = 'CHEM-BASIC';
const MINDRAY_DEFAULT_PORT = 5150;

/** [device_parameter_code, lims_parameter_code, value_type] */
const MINDRAY_CHEM_MAPPINGS = [
  ['Glu', 'GLU', 'numeric'],
  ['GLU', 'GLU', 'numeric'],
  ['Glucose', 'GLU', 'numeric'],
  ['Urea', 'BUN', 'numeric'],
  ['UREA', 'BUN', 'numeric'],
  ['BUN', 'BUN', 'numeric'],
  ['Crea', 'CREA', 'numeric'],
  ['CREA', 'CREA', 'numeric'],
  ['Creatinine', 'CREA', 'numeric'],
  ['AST', 'AST', 'numeric'],
  ['ALT', 'ALT', 'numeric'],
  ['ALP', 'ALP', 'numeric'],
  ['GGT', 'GGT', 'numeric'],
  ['T.P', 'TP', 'numeric'],
  ['TP', 'TP', 'numeric'],
  ['Total Protein', 'TP', 'numeric'],
  ['T.BILI', 'TBIL', 'numeric'],
  ['TBILI', 'TBIL', 'numeric'],
  ['BILI', 'TBIL', 'numeric'],
  ['LDH', 'LDH', 'numeric'],
  ['CK', 'CK', 'numeric'],
  ['FE', 'Fe', 'numeric'],
  ['Iron', 'Fe', 'numeric'],
  ['IRON', 'Fe', 'numeric'],
  ['IP', 'phos', 'numeric'],
  ['PHOS', 'phos', 'numeric'],
  ['Ca', 'Ca', 'numeric'],
  ['CA', 'Ca', 'numeric'],
  ['Calcium', 'Ca', 'numeric'],
  ['Mg', 'MG', 'numeric'],
  ['MG', 'MG', 'numeric'],
  ['Magnesium', 'MG', 'numeric'],
  ['ALB', 'ALB', 'numeric'],
  ['Albumin', 'ALB', 'numeric'],
];

const MINDRAY_CHEM_LIMS_BY_DEVICE = new Map();
for (const [deviceCode, limsCode] of MINDRAY_CHEM_MAPPINGS) {
  MINDRAY_CHEM_LIMS_BY_DEVICE.set(String(deviceCode).trim().toUpperCase(), limsCode);
}

/** Mindray OBX code → LIMS CHEM-BASIC test_parameters.code (case-sensitive in DB). */
function mapMindrayDeviceCodeToLims(deviceCode) {
  if (deviceCode == null || deviceCode === '') return null;
  return MINDRAY_CHEM_LIMS_BY_DEVICE.get(String(deviceCode).trim().toUpperCase()) || null;
}

module.exports = {
  MINDRAY_DEVICE_NAME,
  MINDRAY_TEST_CODE,
  MINDRAY_DEFAULT_PORT,
  MINDRAY_CHEM_MAPPINGS,
  mapMindrayDeviceCodeToLims,
};
