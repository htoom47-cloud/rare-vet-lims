/**
 * C2 verification — Manual Edit > Device Import.
 *
 * Usage: node src/scripts/verify-device-manual-priority.js
 *
 * - Unit: mergeDeviceValuesWithManualProtection preserves manual values
 * - Static: device-import.service.js wires protection + entered_by check
 * - No DB writes
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  mergeDeviceValuesWithManualProtection,
} = require('../services/device-import.service');

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

const importPath = path.join(__dirname, '../services/device-import.service.js');
const importSrc = fs.readFileSync(importPath, 'utf8');

console.log('\n=== C2 Manual Edit > Device Import — unit ===\n');

check('protectManual: keeps existing value when device sends different value', () => {
  const { mergedValues, preserved, applied } = mergeDeviceValuesWithManualProtection(
    [{ parameter_id: 'p1', value: '5.0', notes: null }],
    [{ parameter_id: 'p1', value: '9.9', notes: null }],
    { protectManual: true }
  );
  assert.strictEqual(preserved, 1);
  assert.strictEqual(applied, 0);
  assert.strictEqual(mergedValues.length, 1);
  assert.strictEqual(mergedValues[0].value, '5.0');
});

check('protectManual: device may fill empty/missing parameters only', () => {
  const { mergedValues, preserved, applied } = mergeDeviceValuesWithManualProtection(
    [{ parameter_id: 'p1', value: '5.0' }],
    [
      { parameter_id: 'p1', value: '9.9' },
      { parameter_id: 'p2', value: '1.2' },
    ],
    { protectManual: true }
  );
  assert.strictEqual(preserved, 1);
  assert.strictEqual(applied, 1);
  const byId = Object.fromEntries(mergedValues.map((v) => [v.parameter_id, v.value]));
  assert.strictEqual(byId.p1, '5.0');
  assert.strictEqual(byId.p2, '1.2');
});

check('protectManual: blank existing value is fillable by device', () => {
  const { mergedValues, preserved, applied } = mergeDeviceValuesWithManualProtection(
    [{ parameter_id: 'p1', value: '   ' }],
    [{ parameter_id: 'p1', value: '3.3' }],
    { protectManual: true }
  );
  assert.strictEqual(preserved, 0);
  assert.strictEqual(applied, 1);
  assert.strictEqual(mergedValues[0].value, '3.3');
});

check('device-only (no protect): overwrite existing values', () => {
  const { mergedValues, preserved, applied } = mergeDeviceValuesWithManualProtection(
    [{ parameter_id: 'p1', value: '5.0' }],
    [{ parameter_id: 'p1', value: '9.9' }],
    { protectManual: false }
  );
  assert.strictEqual(preserved, 0);
  assert.strictEqual(applied, 1);
  assert.strictEqual(mergedValues[0].value, '9.9');
});

check('protectManual: retains previous notes when device has none', () => {
  const { mergedValues } = mergeDeviceValuesWithManualProtection(
    [{ parameter_id: 'p1', value: '1', notes: 'tech note' }],
    [{ parameter_id: 'p2', value: '2', notes: null }],
    { protectManual: true }
  );
  const p1 = mergedValues.find((v) => v.parameter_id === 'p1');
  assert.ok(p1);
  assert.strictEqual(p1.notes, 'tech note');
  assert.strictEqual(p1.value, '1');
});

check('first import (no existing rows): applies all device values', () => {
  const { mergedValues, preserved, applied } = mergeDeviceValuesWithManualProtection(
    [],
    [{ parameter_id: 'p1', value: '1.1' }, { parameter_id: 'p2', value: '2.2' }],
    { protectManual: false }
  );
  assert.strictEqual(preserved, 0);
  assert.strictEqual(applied, 2);
  assert.strictEqual(mergedValues.length, 2);
});

console.log('\n=== C2 Manual Edit > Device Import — static ===\n');

check('import uses mergeDeviceValuesWithManualProtection', () => {
  assert.ok(importSrc.includes('mergeDeviceValuesWithManualProtection'));
  assert.ok(/protectManual\s*=\s*Boolean\(existingMeta\?\.entered_by\)/.test(importSrc));
});

check('import keeps entered_by when protecting manual', () => {
  assert.ok(importSrc.includes('enterAsUserId'));
  assert.ok(/enterAsUserId\s*=\s*protectManual\s*\?\s*existingMeta\.entered_by\s*:\s*null/.test(importSrc));
});

check('import skips enterResults when nothing new under protection', () => {
  assert.ok(/protectManual\s*&&\s*applied\s*===\s*0/.test(importSrc));
  assert.ok(importSrc.includes('manual_protected'));
  assert.ok(importSrc.includes('preserved_manual'));
});

check('helper is exported for verification', () => {
  assert.ok(importSrc.includes('mergeDeviceValuesWithManualProtection'));
  const mod = require('../services/device-import.service');
  assert.strictEqual(typeof mod.mergeDeviceValuesWithManualProtection, 'function');
});

check('devices.service still routes replay/import through device-import', () => {
  const devicesSrc = fs.readFileSync(
    path.join(__dirname, '../services/devices.service.js'),
    'utf8'
  );
  assert.ok(devicesSrc.includes("require('./device-import.service')"));
  assert.ok(devicesSrc.includes('importFromParsed'));
});

console.log(`\n=== C2 result: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
