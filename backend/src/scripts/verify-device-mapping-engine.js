/**
 * Device Mapping Engine — unit verification (no DB required for core mapping rules).
 * Usage: node src/scripts/verify-device-mapping-engine.js
 */
const assert = require('assert');
const engine = require('../services/device-mapping-engine.service');

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

const mappedFromDevice = (deviceResult) => {
  const sync = engine.mapDeviceResultToSystemParameterSync(deviceResult);
  return {
    ...sync,
    status: sync.system_parameter_code ? 'mapped' : 'ignored',
    system_parameter_id: sync.system_parameter_code ? '00000000-0000-4000-8000-000000000001' : null,
    error: sync.error || null,
  };
};

console.log('\n=== Device Mapping Engine — Phase 2 ===\n');

const cases = [
  { label: 'WBC mapping', code: 'WBC', unit: '10^3/uL', value: '8.5', expectCode: 'WBC', expectType: 'count' },
  { label: 'LYM% mapping', code: 'LYM%', unit: '%', value: '25', expectCode: 'LYM_PCT', expectType: 'percentage' },
  { label: 'NEU% mapping', code: 'NEU%', unit: '%', value: '60', expectCode: 'NEU_PCT', expectType: 'percentage' },
  { label: 'MON% mapping', code: 'MON%', unit: '%', value: '5', expectCode: 'MON_PCT', expectType: 'percentage' },
  { label: 'RBC mapping', code: 'RBC', unit: '10^6/uL', value: '7.2', expectCode: 'RBC', expectType: 'count' },
  { label: 'HGB mapping', code: 'HGB', unit: 'g/L', value: '120', expectCode: 'HGB', expectType: 'numeric' },
  { label: 'HCT mapping', code: 'HCT', unit: '%', value: '35', expectCode: 'HCT', expectType: 'percentage' },
  { label: 'PLT mapping', code: 'PLT', unit: '10^3/uL', value: '250', expectCode: 'PLT', expectType: 'count' },
];

for (const c of cases) {
  check(c.label, () => {
    const mapped = mappedFromDevice({ code: c.code, unit: c.unit, value: c.value });
    assert.strictEqual(mapped.system_parameter_code, c.expectCode, `code ${mapped.system_parameter_code}`);
    assert.strictEqual(mapped.value_type, c.expectType, `type ${mapped.value_type}`);
    const v = engine.validateMappedDeviceResult(mapped);
    assert.strictEqual(v.valid, true, v.reason);
  });
}

check('LYM + unit % maps to LYM_PCT not WBC', () => {
  const mapped = mappedFromDevice({ code: 'LYM', unit: '%', value: '30' });
  assert.strictEqual(mapped.system_parameter_code, 'LYM_PCT');
  assert.notStrictEqual(mapped.system_parameter_code, 'WBC');
});

check('Unknown code returns ignored with clear error', () => {
  const mapped = mappedFromDevice({ code: 'UNKNOWN-XYZ-999', value: '1' });
  assert.strictEqual(mapped.status, 'ignored');
  assert.ok(mapped.error);
  const v = engine.validateMappedDeviceResult(mapped);
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.ignored, true);
});

check('Validation rejects percent device mapped to WBC count', () => {
  const bad = {
    status: 'mapped',
    device_parameter_code: 'LYM%',
    system_parameter_code: 'WBC',
    system_parameter_id: '00000000-0000-4000-8000-000000000001',
    value_type: 'count',
    value: '25',
    unit: '%',
  };
  const v = engine.validateMappedDeviceResult(bad);
  assert.strictEqual(v.valid, false);
  assert.ok(
    /percent/i.test(v.reason) || /count/i.test(v.reason) || /resolves to/i.test(v.reason),
    v.reason
  );
});

check('Validation rejects count device mapped to LYM_PCT', () => {
  const bad = {
    status: 'mapped',
    device_parameter_code: 'WBC',
    system_parameter_code: 'LYM_PCT',
    system_parameter_id: '00000000-0000-4000-8000-000000000001',
    value_type: 'percentage',
    value: '8',
    unit: '10^3/uL',
  };
  const v = engine.validateMappedDeviceResult(bad);
  assert.strictEqual(v.valid, false);
});

check('Reference stored separately — not mixed into value_type', () => {
  const mapped = mappedFromDevice({
    code: 'WBC',
    unit: '10^3/uL',
    value: '10',
    reference: '4.0-15.0',
  });
  assert.strictEqual(mapped.value, '10');
  assert.strictEqual(mapped.reference, '4.0-15.0');
  assert.strictEqual(mapped.value_type, 'count');
});

check('normalizeDeviceParameterCode trims whitespace', () => {
  assert.strictEqual(engine.normalizeDeviceParameterCode('  LYM%  '), 'LYM%');
});

check('EOS% and BAS% map to percent types', () => {
  for (const code of ['EOS%', 'BAS%']) {
    const mapped = mappedFromDevice({ code, unit: '%', value: '2' });
    assert.strictEqual(mapped.value_type, 'percentage');
    assert.ok(mapped.system_parameter_code.endsWith('_PCT'));
  }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
