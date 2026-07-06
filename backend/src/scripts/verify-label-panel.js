/**
 * Verify label content builder (no browser / printer).
 * Usage: node src/scripts/verify-label-panel.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const panelPath = path.join(__dirname, '../../../frontend/src/utils/labelPanel.js');
const speciesPath = path.join(__dirname, '../../../frontend/src/utils/speciesLabels.js');
const printPath = path.join(__dirname, '../../../frontend/src/utils/printLabel.js');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  OK  ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}: ${err.message}`);
  }
};

console.log('\n=== verify-label-panel ===\n');

check('labelPanel exports buildThermalLabelContent', () => {
  const src = fs.readFileSync(panelPath, 'utf8');
  assert.ok(src.includes('export const buildThermalLabelContent'));
  assert.ok(src.includes('export const buildZebraThermalLabelContent'));
  assert.ok(src.includes('speciesLabel'));
  assert.ok(src.includes('speciesLabelForZpl'));
  assert.ok(!src.includes('animalCode'), 'stale animalCode reference');
});

check('speciesLabels module exists', () => {
  const src = fs.readFileSync(speciesPath, 'utf8');
  assert.ok(src.includes('export const speciesLabel'));
  assert.ok(src.includes('bootstrapSpeciesLabels'));
});

check('printLabel uses Zebra-first modal flow', () => {
  const src = fs.readFileSync(printPath, 'utf8');
  assert.ok(src.includes('printSampleLabelFromModal'));
  assert.ok(src.includes('printJobsToZebra'));
  assert.ok(!src.match(/printSampleLabelInPlace\(\)/), 'must not print the LIMS app page');
  assert.ok(src.includes('writeBrowserPrintToWindow'));
});

check('barcode engine builds ZPL for standard sample', () => {
  const engine = require('../services/barcode-engine.service');
  const payload = engine.buildBarcodePayload({
    sample_code: '26000003',
    barcode: '260705798445',
    animal_type: 'camel',
    tests: [{ test_code: 'CBC', category_code: 'CBC' }],
  });
  const zpl = engine.buildZplLabel(payload);
  assert.ok(zpl.includes('^XA') && zpl.includes('^XZ'));
  assert.ok(zpl.includes('260705798445'));
  assert.ok(zpl.includes('Sample 26000003'));
});

console.log(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed ? 1 : 0);
