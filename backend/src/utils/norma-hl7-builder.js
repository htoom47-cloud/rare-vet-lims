/** Build Norma-style HL7 ORU messages for CBC import (values + units + reference ranges). */
const { NORMA_CBC_ORDER } = require('./norma-cbc-map');
const { NORMA_CBC_REFERENCES } = require('./norma-cbc-references');

const PARAM_UNITS = {
  WBC: '10^3/uL', LYM: '10^3/uL', LYM_PCT: '%', MON: '10^3/uL', MON_PCT: '%',
  NEU: '10^3/uL', NEU_PCT: '%', EOS: '10^3/uL', EOS_PCT: '%', BAS: '10^3/uL', BAS_PCT: '%',
  RBC: '10^6/uL', HGB: 'g/dL', MCV: 'fL', HCT: '%', MCH: 'pg', MCHC: 'g/dL',
  'RDW-SD': 'fL', 'RDW-CV': '%', PLT: '10^3/uL', MPV: 'fL', PCT: '%',
  'PDW-SD': 'fL', 'PDW-CV': '%', 'PLC-R': '%', 'PLC-C': '10^3/uL', RDW: '%',
};

const formatRef = (ref) => {
  if (!ref || ref.min == null || ref.max == null) return '';
  return `${ref.min}-${ref.max}`;
};

const flagFromValue = (value, ref) => {
  if (!ref || value == null || value === '') return 'N';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 'N';
  if (n > ref.max) return 'H';
  if (n < ref.min) return 'L';
  return 'N';
};

const buildNormaCbcHl7 = (sampleCode, valueOverrides = {}, animalType = 'camel') => {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const values = { ...valueOverrides };
  const refs = NORMA_CBC_REFERENCES[animalType] || NORMA_CBC_REFERENCES.camel;

  const obx = NORMA_CBC_ORDER
    .filter((code) => values[code] != null && values[code] !== '')
    .map((code, i) => {
      const unit = PARAM_UNITS[code] || '';
      const ref = refs[code] || refs[code === 'RDW-CV' ? 'RDW' : code];
      const refStr = formatRef(ref);
      const flag = flagFromValue(values[code], ref);
      return `OBX|${i + 1}|NM|${code}^${code}^Norma||${values[code]}|${unit}|${refStr}|${flag}|||F`;
    });

  return [
    `MSH|^~\\&|Norma|CBC|LIMS|Lab|${ts}||ORU^R01^ORU_R01|NORMA-${Date.now()}|P|2.3`,
    `PID|1||${sampleCode}^^^||PATIENT^TEST`,
    `OBR|1||${sampleCode}||CBC^Complete Blood Count`,
    ...obx,
  ].join('\r');
};

/** Full Norma camel CBC panel with reference ranges (for tests / gap-fill). */
const buildFullNormaPanelValues = (overrides = {}) => {
  const defaults = {
    WBC: '8.2', LYM: '2.1', LYM_PCT: '25.6', MON: '0.4', MON_PCT: '4.9',
    NEU: '5.5', NEU_PCT: '67.1', EOS: '0.2', EOS_PCT: '2.4', BAS: '0.0', BAS_PCT: '0.0',
    RBC: '7.8', HGB: '11.5', MCV: '32', HCT: '30.5', MCH: '14.7', MCHC: '37.7',
    'RDW-SD': '28.5', 'RDW-CV': '14.2', PLT: '210', MPV: '8.1', PCT: '0.17',
    'PDW-SD': '9.2', 'PDW-CV': '16.5', 'PLC-R': '18.2', 'PLC-C': '38',
  };
  return { ...defaults, ...overrides };
};

module.exports = { buildNormaCbcHl7, buildFullNormaPanelValues, PARAM_UNITS, formatRef };
