/**
 * Customer store credit — static safety checks (no DB).
 * Usage: node src/scripts/verify-store-credit.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const envSrc = read('src/config/env.js');
const featuresSrc = read('src/utils/staff-features.js');
const migrateSrc = read('src/scripts/migrate.js');
const ledgerSrc = read('src/services/ledger.service.js');
const serviceSrc = read('src/services/customer-store-credit.service.js');
const billingSrc = read('src/services/billing.service.js');
const accountingSrc = read('src/services/accounting.service.js');
const schemasSrc = read('src/validators/schemas.js');
const routesSrc = read('src/routes/customers.routes.js');
const customersUi = read('../frontend/src/pages/Customers.jsx');
const billingUi = read('../frontend/src/pages/Billing.jsx');

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

console.log('\n=== Store Credit Safety ===\n');

check('feature flag defaults false', () => {
  assert.ok(envSrc.includes("storeCredit: process.env.STORE_CREDIT_ENABLED === 'true'"));
  assert.ok(featuresSrc.includes('storeCredit:'));
});

check('migration adds balance column, entries table, enum, ledger 2200', () => {
  assert.ok(migrateSrc.includes('store_credit_balance'));
  assert.ok(migrateSrc.includes('customer_store_credit_entries'));
  assert.ok(migrateSrc.includes("ADD VALUE IF NOT EXISTS 'store_credit'"));
  assert.ok(migrateSrc.includes("'2200'"));
});

check('ledger has deposit (cash→2200) and apply (2200→AR) posts', () => {
  assert.ok(ledgerSrc.includes("code: '2200'"));
  assert.ok(ledgerSrc.includes('postStoreCreditDeposit'));
  assert.ok(ledgerSrc.includes('postStoreCreditApply'));
  assert.ok(ledgerSrc.includes("source_type', 'store_credit_deposit'") || ledgerSrc.includes("'store_credit_deposit'"));
});

check('deposit requires notes + cash method; apply refuses negative/overdraw', () => {
  assert.ok(serviceSrc.includes('NOTES_REQUIRED'));
  assert.ok(serviceSrc.includes('INSUFFICIENT_STORE_CREDIT'));
  assert.ok(serviceSrc.includes("entry_type`, `amount`, `method`") || serviceSrc.includes("'deposit'"));
  assert.ok(serviceSrc.includes('assertDayOpen'));
});

check('recordPayment wires store_credit without cash postPayment', () => {
  assert.ok(billingSrc.includes("data.method === 'store_credit'"));
  assert.ok(billingSrc.includes('postStoreCreditApply'));
  assert.ok(billingSrc.includes('applyOnPayment'));
  assert.ok(billingSrc.includes('CANNOT_REFUND_STORE_CREDIT'));
  // cash postPayment skipped for store_credit
  assert.ok(/isStoreCredit[\s\S]*postStoreCreditApply[\s\S]*else if \(data\.method !== 'credit'\)/.test(billingSrc)
    || /if \(isStoreCredit\)[\s\S]*postStoreCreditApply[\s\S]*else if \(data\.method !== 'credit'\)/.test(billingSrc));
});

check('collections_total excludes store_credit; applied total reported separately', () => {
  assert.ok(accountingSrc.includes("method IS DISTINCT FROM 'store_credit'"));
  assert.ok(accountingSrc.includes('store_credit_applied_total'));
});

check('payment schema allows store_credit; deposit schema separate', () => {
  assert.ok(schemasSrc.includes("'store_credit'"));
  assert.ok(schemasSrc.includes('storeCreditDepositSchema'));
});

check('customer routes for deposit behind billing.store_credit', () => {
  assert.ok(routesSrc.includes('/:id/store-credit'));
  assert.ok(routesSrc.includes('BILLING_STORE_CREDIT'));
  assert.ok(routesSrc.includes('storeCredit.deposit'));
});

check('UI gated by storeCredit feature flag', () => {
  assert.ok(customersUi.includes('storeCredit'));
  assert.ok(customersUi.includes('depositStoreCredit'));
  assert.ok(billingUi.includes('canStoreCredit'));
  assert.ok(billingUi.includes('store_credit'));
});

check('account_balance sync path unchanged (no store_credit in remainingSql)', () => {
  assert.ok(!/remainingSql[\s\S]*store_credit/.test(accountingSrc.slice(
    accountingSrc.indexOf('const remainingSql'),
    accountingSrc.indexOf('const remainingSql') + 400
  )));
  assert.ok(accountingSrc.includes('syncCustomerArBalance'));
});

check('OVERPAYMENT still enforced (evaluatePayment untouched for overpay)', () => {
  const settlement = read('src/utils/invoice-settlement.js');
  assert.ok(settlement.includes("code: 'OVERPAYMENT'"));
  assert.ok(settlement.includes('Payment exceeds balance due'));
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
