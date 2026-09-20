/**
 * Preliminary reports — unit verification (no DB required).
 * Usage: node src/scripts/verify-preliminary-reports.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolveGenerateMode,
  shouldReuseExistingReport,
  pendingTestLabel,
} = require('../utils/preliminary-report');

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

const ROOT = path.join(__dirname, '..');

console.log('\n=== Preliminary reports ===\n');

check('flag off + incomplete sample → no generate', () => {
  assert.strictEqual(resolveGenerateMode({
    flagEnabled: false, completed: false, hasValidated: true, pendingCount: 2,
  }), null);
});

check('flag off + completed + validated → final', () => {
  assert.strictEqual(resolveGenerateMode({
    flagEnabled: false, completed: true, hasValidated: true, pendingCount: 0,
  }), 'final');
});

check('flag on + validated + pending → preliminary', () => {
  assert.strictEqual(resolveGenerateMode({
    flagEnabled: true, completed: false, hasValidated: true, pendingCount: 2,
  }), 'preliminary');
});

check('flag on + completed → final even if pendingCount stale', () => {
  assert.strictEqual(resolveGenerateMode({
    flagEnabled: true, completed: true, hasValidated: true, pendingCount: 0,
  }), 'final');
});

check('flag on + no validated results → no generate', () => {
  assert.strictEqual(resolveGenerateMode({
    flagEnabled: true, completed: false, hasValidated: false, pendingCount: 2,
  }), null);
});

check('reuse existing final', () => {
  assert.strictEqual(shouldReuseExistingReport({
    forceRegenerate: false, mode: 'final', existingIsFinal: true,
  }), true);
});

check('do not reuse prelim when issuing final', () => {
  assert.strictEqual(shouldReuseExistingReport({
    forceRegenerate: false, mode: 'final', existingIsFinal: false,
  }), false);
});

check('reuse existing prelim while still pending', () => {
  assert.strictEqual(shouldReuseExistingReport({
    forceRegenerate: false, mode: 'preliminary', existingIsFinal: false,
  }), true);
});

check('forceRegenerate never reuses', () => {
  assert.strictEqual(shouldReuseExistingReport({
    forceRegenerate: true, mode: 'preliminary', existingIsFinal: false,
  }), false);
});

check('pending label prefers Arabic name', () => {
  assert.strictEqual(pendingTestLabel({
    test_name_ar: 'إليزا', test_name: 'ELISA', test_code: 'ELISA-1',
  }, 'ar'), 'إليزا');
});

check('env flag defaults off', () => {
  const src = fs.readFileSync(path.join(ROOT, 'config', 'env.js'), 'utf8');
  assert.ok(src.includes('preliminaryReports'));
  assert.ok(src.includes("PRELIMINARY_REPORTS_ENABLED === 'true'"));
});

check('staff-features exposes preliminaryReports', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'staff-features.js'), 'utf8');
  assert.ok(src.includes('preliminaryReports'));
});

check('generate uses resolveGenerateMode and parameterized is_final', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.service.js'), 'utf8');
  assert.ok(src.includes('resolveGenerateMode'));
  assert.ok(src.includes('shouldReuseExistingReport'));
  assert.ok(src.includes('pendingTests'));
  assert.ok(src.includes('$13'));
});

check('report lock unchanged unless flag on', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'report-lock.service.js'), 'utf8');
  assert.ok(src.includes('preliminaryReports'));
  assert.ok(src.includes('lab_specialist_approved_by IS NOT NULL'));
  assert.ok(src.includes('is_final = true'));
});

check('generate keeps completed-sample path when flag off', () => {
  const src = fs.readFileSync(path.join(ROOT, 'services', 'reports.service.js'), 'utf8');
  assert.ok(src.includes("status = $2"));
  assert.ok(src.includes("if (!prelimEnabled)"));
});

check('design-3 lists pending tests', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'report-designs', 'design-3', 'build-html.js'), 'utf8');
  assert.ok(src.includes('buildPendingTestsSection'));
  assert.ok(src.includes('قيد الإجراء'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
