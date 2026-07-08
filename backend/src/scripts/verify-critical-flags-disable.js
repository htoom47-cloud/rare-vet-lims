/**
 * Verify critical-flags disable does not break Min/Max HIGH/LOW behaviour.
 * Usage: node src/scripts/verify-critical-flags-disable.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const criticalFlags = require('../utils/critical-flags');
const engine = require('../services/result-engine.service');
const { evaluateFlag } = require('../utils/helpers');

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

console.log('\n=== Critical flags disable — safety verify ===\n');

const limsRow = (code, min, max, extras = {}) => ({
  parameter_code: code,
  trr_min: min,
  trr_max: max,
  trr_critical_low: extras.critical_low ?? null,
  trr_critical_high: extras.critical_high ?? null,
  trr_text_reference: extras.text_reference ?? null,
  trr_is_active: true,
  trr_animal_type: 'camel',
  unit: extras.unit ?? '10^3/uL',
  value: extras.value,
});

check('default: critical flags enabled', () => {
  criticalFlags.setCriticalFlagsDisabled(false);
  assert.strictEqual(criticalFlags.isCriticalFlagsEnabled(), true);
});

check('helpers: critical wins when enabled', () => {
  const r = evaluateFlag(50, 4, 15, 2, 30);
  assert.strictEqual(r.flag, 'CRIT_HIGH');
  assert.strictEqual(r.isCritical, true);
});

check('helpers: HIGH when critical bounds null', () => {
  const r = evaluateFlag(50, 4, 15, null, null);
  assert.strictEqual(r.flag, 'HIGH');
  assert.strictEqual(r.isCritical, false);
});

check('helpers: LOW when critical bounds null', () => {
  const r = evaluateFlag(1, 4, 15, null, null);
  assert.strictEqual(r.flag, 'LOW');
  assert.strictEqual(r.isCritical, false);
});

check('engine: with disable ON — above max → HIGH not CRITICAL', () => {
  criticalFlags.setCriticalFlagsDisabled(true);
  const row = limsRow('WBC', 4, 15, { value: '50', critical_high: 30, critical_low: 2 });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.HIGH);
  assert.strictEqual(ev.isCritical, false);
  assert.strictEqual(ev.detailFlag, engine.RESULT_FLAGS.HIGH);
});

check('engine: with disable ON — below min → LOW not CRITICAL', () => {
  criticalFlags.setCriticalFlagsDisabled(true);
  const row = limsRow('WBC', 4, 15, { value: '1', critical_high: 30, critical_low: 2 });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.LOW);
  assert.strictEqual(ev.isCritical, false);
});

check('engine: with disable ON — within range → NORMAL', () => {
  criticalFlags.setCriticalFlagsDisabled(true);
  const row = limsRow('WBC', 4, 15, { value: '10', critical_high: 30, critical_low: 2 });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.NORMAL);
});

check('engine: with disable OFF — critical restored', () => {
  criticalFlags.setCriticalFlagsDisabled(false);
  const row = limsRow('WBC', 4, 15, { value: '50', critical_high: 30, critical_low: 2 });
  const ev = engine.evaluateResult(row);
  assert.strictEqual(ev.flag, engine.RESULT_FLAGS.CRITICAL);
  assert.strictEqual(ev.isCritical, true);
});

check('wiring: settings route handles disable_critical_flags', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/settings.routes.js'), 'utf8');
  assert.ok(src.includes('disable_critical_flags') || src.includes('CRITICAL_FLAGS_KEY'));
  assert.ok(src.includes('saveCriticalFlagsDisabled'));
});

check('wiring: settings UI has toggle', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/Settings.jsx'), 'utf8');
  assert.ok(ui.includes('disable_critical_flags'));
  assert.ok(ui.includes('handleCriticalToggle'));
});

check('wiring: reference engine nulls critical when disabled', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../services/reference-range-engine.service.js'),
    'utf8'
  );
  assert.ok(src.includes('isCriticalFlagsDisabled()'));
});

// restore default for other tests in same process
criticalFlags.setCriticalFlagsDisabled(false);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
