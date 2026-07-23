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
  // Urea → BUN (Blood Urea Nitrogen). Include common BS-120 / LIS / LOINC aliases.
  ['Urea', 'BUN', 'numeric'],
  ['UREA', 'BUN', 'numeric'],
  ['URE', 'BUN', 'numeric'],
  ['BUN', 'BUN', 'numeric'],
  ['UREA-N', 'BUN', 'numeric'],
  ['UREAN', 'BUN', 'numeric'],
  ['UREA NITROGEN', 'BUN', 'numeric'],
  ['UREA(BUN)', 'BUN', 'numeric'],
  ['UREA (BUN)', 'BUN', 'numeric'],
  ['BLOOD UREA', 'BUN', 'numeric'],
  ['BLOOD UREA NITROGEN', 'BUN', 'numeric'],
  ['3094-0', 'BUN', 'numeric'],
  ['22664-7', 'BUN', 'numeric'],
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
  ['TBIL', 'TBIL', 'numeric'],
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

/** LIMS CHEM-BASIC params required for Mindray ingest (created if missing). */
const MINDRAY_CHEM_PARAM_DEFS = [
  { code: 'MG', name: 'Magnesium', name_ar: 'المغنيسيوم', unit: 'mg/dL' },
  { code: 'TBIL', name: 'Total Bilirubin', name_ar: 'البيليروبين الكلي', unit: 'mg/dL' },
  { code: 'GGT', name: 'GGT', name_ar: 'GGT', unit: 'U/L' },
  { code: 'LDH', name: 'LDH', name_ar: 'LDH', unit: 'U/L' },
  { code: 'CK', name: 'CK', name_ar: 'CK', unit: 'U/L' },
  { code: 'Fe', name: 'Iron', name_ar: 'الحديد', unit: 'µg/dL' },
  { code: 'phos', name: 'Phosphorus', name_ar: 'الفوسفور', unit: 'mg/dL' },
  { code: 'Ca', name: 'Calcium', name_ar: 'الكالسيوم', unit: 'mg/dL' },
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
  MINDRAY_CHEM_PARAM_DEFS,
  mapMindrayDeviceCodeToLims,
};
