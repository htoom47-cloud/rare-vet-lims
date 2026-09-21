/**
 * Thermal invoice item aggregation — unit verification (no DB).
 * Usage: node src/scripts/verify-thermal-invoice-items.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { catalogLabel, aggregateThermalInvoiceItems } = require('../utils/thermal-invoice-items');

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

console.log('\n=== Thermal invoice items ===\n');

check('strips animal prefix from description', () => {
  assert.strictEqual(
    catalogLabel({ description: 'مشعل — باقة صحة الحيوان', name_tag: 'مشعل', package_id: 'p1' }),
    'باقة صحة الحيوان'
  );
});

check('keeps field-visit description without animal', () => {
  assert.strictEqual(
    catalogLabel({ description: 'زيارة ميدانية — 12 كم', service_code: 'FIELD-VISIT' }),
    'زيارة ميدانية — 12 كم'
  );
});

check('aggregates same package across animals', () => {
  const rows = aggregateThermalInvoiceItems([
    { package_id: 'p1', description: 'مشعل — باقة صحة الحيوان', quantity: 1, total_price: 200 },
    { package_id: 'p1', description: 'لولو — باقة صحة الحيوان', quantity: 1, total_price: 200 },
    { package_id: 'p2', description: 'مشعل — باقة دموية', quantity: 1, total_price: 150 },
  ]);
  assert.strictEqual(rows.length, 2);
  const health = rows.find((r) => r.description === 'باقة صحة الحيوان');
  const blood = rows.find((r) => r.description === 'باقة دموية');
  assert.strictEqual(health.quantity, 2);
  assert.strictEqual(health.total_price, 400);
  assert.strictEqual(blood.quantity, 1);
  assert.ok(!rows.some((r) => /مشعل|لولو/.test(r.description)));
});

check('HTML printer uses aggregator', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/utils/thermalInvoicePrint.js'),
    'utf8'
  );
  assert.ok(src.includes('aggregateThermalInvoiceItems'));
});

check('thermal PDF uses aggregator and omits name_tag', () => {
  const src = fs.readFileSync(path.join(__dirname, '../utils/invoice-thermal-pdf.js'), 'utf8');
  assert.ok(src.includes('aggregateThermalInvoiceItems'));
  assert.ok(!src.includes('item.name_tag'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
