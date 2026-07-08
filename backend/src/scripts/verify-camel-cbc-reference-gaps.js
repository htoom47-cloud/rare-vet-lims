/**
 * Quick checks for camel CBC reference gap fix (no DB writes).
 * Usage: node src/scripts/verify-camel-cbc-reference-gaps.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

console.log('\n=== Camel CBC reference gap fix — verify ===\n');

const upsertSrc = fs.readFileSync(
  path.join(__dirname, '../services/reference-ranges.service.js'),
  'utf8'
);
const adminSrc = fs.readFileSync(
  path.join(__dirname, '../services/reference-ranges-admin.service.js'),
  'utf8'
);
const fixSrc = fs.readFileSync(
  path.join(__dirname, 'fix-camel-cbc-reference-gaps.js'),
  'utf8'
);

check('upsert sets is_active = true on update', () => {
  assert.ok(upsertSrc.includes('is_active = true, updated_at = NOW()'));
});

check('admin create reactivates inactive instead of duplicate insert', () => {
  assert.ok(adminSrc.includes("'reactivate'"));
  assert.ok(adminSrc.includes('is_active = false'));
  assert.ok(adminSrc.includes('Inactive row still occupies unique'));
});

check('fix script targets camel CBC display gaps only', () => {
  assert.ok(fixSrc.includes("SPECIES = 'camel'"));
  assert.ok(fixSrc.includes('LYM_PCT'));
  assert.ok(fixSrc.includes('RDW-SD'));
  assert.ok(fixSrc.includes('regeneratePdfById'));
  assert.ok(fixSrc.includes('--fix'));
});

check('ensure-cbc-reference-ranges still wired for deploy', () => {
  const cloud = fs.readFileSync(path.join(__dirname, 'cloud-start.js'), 'utf8');
  assert.ok(cloud.includes('ensure-cbc-reference-ranges.js'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
