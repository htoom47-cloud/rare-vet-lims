/**
 * Mindray urea aliases → BUN (no DB).
 * Usage: node src/scripts/verify-mindray-urea-map.js
 */
const assert = require('assert');
const { mapMindrayDeviceCodeToLims } = require('../utils/mindray-chem-map');

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

console.log('\n=== Mindray urea → BUN aliases ===\n');

const shouldMap = [
  'Urea', 'UREA', 'URE', 'BUN', 'UREA-N', 'UREAN',
  'Urea Nitrogen', 'UREA NITROGEN', 'Urea(BUN)', 'UREA (BUN)',
  'Blood Urea', 'Blood Urea Nitrogen', '3094-0', '22664-7',
];

for (const code of shouldMap) {
  check(`${code} → BUN`, () => {
    assert.strictEqual(mapMindrayDeviceCodeToLims(code), 'BUN');
  });
}

check('UA (uric acid) stays unmapped', () => {
  assert.strictEqual(mapMindrayDeviceCodeToLims('UA'), null);
});

check('GLU unchanged', () => {
  assert.strictEqual(mapMindrayDeviceCodeToLims('GLU'), 'GLU');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
