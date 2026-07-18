/**
 * C3 verification — concurrent payment/refund protection.
 *
 * Usage: node src/scripts/verify-billing-concurrency.js
 *
 * - Unit: computeRefundableAmount caps refunds correctly
 * - Static: recordPayment / processRefund / cancelInvoice use FOR UPDATE + txn
 * - No DB writes
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { computeRefundableAmount } = require('../services/billing.service');

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

const billingPath = path.join(__dirname, '../services/billing.service.js');
const billingSrc = fs.readFileSync(billingPath, 'utf8');

console.log('\n=== C3 billing concurrency — unit ===\n');

check('full refund allowed when nothing refunded yet', () => {
  assert.strictEqual(computeRefundableAmount(100, 0), 100);
});

check('partial prior refund reduces refundable', () => {
  assert.strictEqual(computeRefundableAmount(100, 40), 60);
});

check('fully refunded → refundable 0 (blocks sequential over-refund)', () => {
  assert.strictEqual(computeRefundableAmount(100, 100), 0);
});

check('over-refunded input clamps to 0', () => {
  assert.strictEqual(computeRefundableAmount(50, 80), 0);
});

check('string numbers are accepted', () => {
  assert.strictEqual(computeRefundableAmount('25.50', '10.25'), 15.25);
});

console.log('\n=== C3 billing concurrency — static ===\n');

check('recordPayment locks invoice row FOR UPDATE', () => {
  const fn = billingSrc.slice(
    billingSrc.indexOf('const recordPayment'),
    billingSrc.indexOf('const listPackages')
  );
  assert.ok(/FOR UPDATE/.test(fn), 'missing FOR UPDATE in recordPayment');
  assert.ok(/BEGIN/.test(fn) && /COMMIT/.test(fn));
});

check('processRefund uses transaction + FOR UPDATE', () => {
  const fn = billingSrc.slice(
    billingSrc.indexOf('const processRefund'),
    billingSrc.indexOf('const exportInvoicesCsv')
  );
  assert.ok(/getClient/.test(fn));
  assert.ok(/FOR UPDATE/.test(fn));
  assert.ok(/BEGIN/.test(fn) && /COMMIT/.test(fn));
  assert.ok(/computeRefundableAmount/.test(fn));
  assert.ok(/FROM refunds WHERE invoice_id/.test(fn));
});

check('processRefund caps by payments − prior refunds (not total_paid alone)', () => {
  const fn = billingSrc.slice(
    billingSrc.indexOf('const processRefund'),
    billingSrc.indexOf('const exportInvoicesCsv')
  );
  assert.ok(!/amount > invoice\.total_paid/.test(fn));
  assert.ok(/refundable/.test(fn));
});

check('cancelInvoice locks invoice row FOR UPDATE', () => {
  const fn = billingSrc.slice(
    billingSrc.indexOf('const cancelInvoice'),
    billingSrc.indexOf('const processRefund')
  );
  assert.ok(/FOR UPDATE/.test(fn));
  assert.ok(/BEGIN/.test(fn) && /COMMIT/.test(fn));
});

check('helper exported', () => {
  const mod = require('../services/billing.service');
  assert.strictEqual(typeof mod.computeRefundableAmount, 'function');
});

check('billing routes still call recordPayment / processRefund', () => {
  const routesSrc = fs.readFileSync(
    path.join(__dirname, '../routes/billing.routes.js'),
    'utf8'
  );
  assert.ok(routesSrc.includes('recordPayment'));
  assert.ok(routesSrc.includes('processRefund'));
});

console.log(`\n=== C3 result: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
