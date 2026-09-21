/**
 * Thermal invoice item aggregation — unit verification (no DB).
 * Usage: node src/scripts/verify-thermal-invoice-items.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { catalogLabel, aggregateThermalInvoiceItems } = require('../utils/thermal-invoice-items');
const { paymentMethodAr } = require('../utils/invoice-thermal-pdf');

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

check('thermal PDF is black ink with wider margin and Arabic meta', () => {
  const src = fs.readFileSync(path.join(__dirname, '../utils/invoice-thermal-pdf.js'), 'utf8');
  assert.ok(/const INK = '#000000'/.test(src));
  assert.ok(/const MARGIN = 14/.test(src));
  assert.ok(src.includes("drawArBox(doc, 'الحالة'"));
  assert.ok(src.includes('status.ar'));
  assert.ok(!/drawEn\(doc, status/.test(src));
  assert.ok(src.includes("drawArBox(doc, 'الصنف'"));
  assert.ok(src.includes("drawArBox(doc, 'العدد'"));
  assert.ok(src.includes("drawArBox(doc, 'ريال'"));
  assert.ok(src.includes('paymentMethodAr'));
  assert.ok(!src.includes('${qty} ${'));
});

check('HTML thermal receipt uses Arabic headers and isolated qty', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/utils/thermalInvoicePrint.js'),
    'utf8'
  );
  assert.ok(src.includes('الصنف'));
  assert.ok(src.includes('العدد'));
  assert.ok(src.includes('unicode-bidi: isolate'));
  assert.ok(src.includes("color: #000"));
});

check('paymentMethodAr maps Epson receipt methods', () => {
  assert.strictEqual(paymentMethodAr('bank_transfer'), 'تحويل بنكي');
  assert.strictEqual(paymentMethodAr('cash'), 'نقدي');
  assert.strictEqual(paymentMethodAr('card'), 'شبكة');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
