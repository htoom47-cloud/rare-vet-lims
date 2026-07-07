/**
 * Static checks for brucella catalog consolidation.
 * Usage: node src/scripts/verify-brucella-catalog.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..', '..');
const FRONT = path.join(ROOT, 'frontend', 'src');

let passed = 0;
let failed = 0;

const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed += 1;
  }
};

console.log('\n=== Brucella catalog consolidation ===\n');

check('ensure-parasitology does not seed BRU-ROSE-BENGAL at 150', () => {
  const src = fs.readFileSync(path.join(__dirname, 'ensure-parasitology.js'), 'utf8');
  assert.ok(!src.includes('price: 150'), '150 price should be removed from seed');
  assert.ok(src.includes('consolidateBrucellaCatalog'));
});

check('consolidate script exists with dry-run and --fix', () => {
  const src = fs.readFileSync(path.join(__dirname, 'consolidate-brucella-catalog.js'), 'utf8');
  assert.ok(src.includes('--fix'));
  assert.ok(src.includes('is_active = false'));
  assert.ok(src.includes('BRU-ROSE-BENGAL'));
});

check('frontend recognizes BRUCELLA code', () => {
  const src = fs.readFileSync(path.join(FRONT, 'utils', 'parasitologyTests.js'), 'utf8');
  assert.ok(src.includes('BRUCELLA'));
  assert.ok(src.includes('isBrucellaTestCode'));
});

check('Samples uses localized test display name', () => {
  const src = fs.readFileSync(path.join(FRONT, 'pages', 'Samples.jsx'), 'utf8');
  assert.ok(src.includes('testDisplayName(test'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
