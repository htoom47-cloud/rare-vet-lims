/**
 * ASTM parser checks — Diasys Respons 910 ^^^CODE and sample ID.
 * Usage: node src/scripts/verify-astm-parser.js
 */
const assert = require('assert');
const { parseAstm, firstComponent, recordType } = require('../utils/astm');
const { mapDiasysDeviceCodeToLims } = require('../utils/diasys-chem-map');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

console.log('\n=== ASTM parser (Diasys / generic) ===\n');

check('firstComponent reads ^^^GLU^Glucose', () => {
  assert.strictEqual(firstComponent('^^^GLU^Glucose'), 'GLU');
});

check('recordType strips frame number', () => {
  assert.strictEqual(recordType('4R'), 'R');
  assert.strictEqual(recordType('H'), 'H');
});

check('Diasys ASTM extracts sample ID and chemistry codes', () => {
  const raw = [
    'H|\\^&|||Respons910||||||||',
    'P|1||||',
    'O|1|BC-260813-123456|BC-260813-123456|^^^GLU',
    'R|1|^^^GLU^Glucose|95.2|mg/dL|60-120|N||F',
    'R|2|^^^UREA^Urea|28|mg/dL|8-28|N||F',
    'R|3|^^^CREA^Creatinine|1.4|mg/dL|0.8-2.0|N||F',
    'L|1|N',
  ].join('\r');
  const parsed = parseAstm(raw);
  assert.strictEqual(parsed.protocol, 'ASTM');
  assert.strictEqual(parsed.sampleId, 'BC-260813-123456');
  assert.strictEqual(parsed.results.length, 3);
  assert.strictEqual(parsed.results[0].code, 'GLU');
  assert.strictEqual(parsed.results[0].value, '95.2');
  assert.strictEqual(parsed.results[1].code, 'UREA');
  assert.strictEqual(parsed.results[2].code, 'CREA');
});

check('Sample ID from O field with caret suffix', () => {
  const raw = 'O|1|BC-260813-999001^1^1||^^^ALT\rR|1|^^^ALT|42|U/L||N||F\r';
  const parsed = parseAstm(raw);
  assert.strictEqual(parsed.sampleId, 'BC-260813-999001');
  assert.strictEqual(parsed.results[0].code, 'ALT');
});

check('Does not apply Norma CBC codes to chemistry results', () => {
  const raw = 'O|1|BC-1||\rR|1|^^^GLU|90|mg/dL||N||F\r';
  const parsed = parseAstm(raw);
  assert.strictEqual(parsed.results[0].limsCode, null);
  assert.strictEqual(parsed.results[0].code, 'GLU');
});

check('Diasys static map: UREA/GPT/GOT → LIMS codes', () => {
  assert.strictEqual(mapDiasysDeviceCodeToLims('UREA'), 'BUN');
  assert.strictEqual(mapDiasysDeviceCodeToLims('GPT'), 'ALT');
  assert.strictEqual(mapDiasysDeviceCodeToLims('GOT'), 'AST');
  assert.strictEqual(mapDiasysDeviceCodeToLims('UNKNOWN-XYZ'), null);
});

check('Diasys Respons codes: CREAJ / 054 / GLUC GOD', () => {
  assert.strictEqual(mapDiasysDeviceCodeToLims('CREAJ'), 'CREA');
  assert.strictEqual(mapDiasysDeviceCodeToLims('054'), 'BUN');
  assert.strictEqual(mapDiasysDeviceCodeToLims('GLUC GOD'), 'GLU');
  assert.strictEqual(mapDiasysDeviceCodeToLims('801'), null);
});

check('Empty R code uses following GLUC GOD comment as glucose', () => {
  const raw = [
    'R|11|^^^|105.3|||||V||Guest|',
    'C|1|I|WARNING !!! Chemistry GLUC GOD. Host Reference missing.|I',
    'C|2|I|TS_OK|I',
    'R|12|^^^MG|1.7|mg/dL||||V||Guest|',
  ].join('\r');
  const parsed = parseAstm(raw);
  assert.strictEqual(parsed.results.length, 2);
  assert.strictEqual(parsed.results[0].code, 'GLU');
  assert.strictEqual(parsed.results[0].value, '105.3');
  assert.strictEqual(parsed.results[1].code, 'MG');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
