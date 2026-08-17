/**
 * Purchase posting — static checks. No database writes.
 * Usage: node src/scripts/verify-purchase-posting.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
const {
  buildPurchaseJournalLines,
  creditAccountCode,
  SALES_VAT_PAYABLE_CODE,
  postingPreview,
  assertStoredTotals,
  RECOVERABLE_VAT_POLICY,
} = require('../utils/purchase-posting');
const { sarTextFromHalalas, expectedCashHalalas } = require('../utils/money');

const root = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
};

console.log('\n=== Purchase posting contract ===\n');

check('purchases.post is admin/manager/accountant only', () => {
  assert.equal(PERMISSIONS.PURCHASES_POST, 'purchases.post');
  assert.ok(ROLE_PERMISSIONS.admin.includes(PERMISSIONS.PURCHASES_POST));
  assert.ok(ROLE_PERMISSIONS.manager.includes(PERMISSIONS.PURCHASES_POST));
  assert.ok(ROLE_PERMISSIONS.accountant.includes(PERMISSIONS.PURCHASES_POST));
  assert.ok(!ROLE_PERMISSIONS.purchaser.includes(PERMISSIONS.PURCHASES_POST));
  for (const role of ['reception', 'lab_technician', 'lab_specialist', 'veterinarian']) {
    assert.ok(!(ROLE_PERMISSIONS[role] || []).includes(PERMISSIONS.PURCHASES_POST));
  }
});

check('proposed posting SQL is re-runnable and not wired to migrate.js', () => {
  const sql = read('migrations/proposed-purchase-posting.sql');
  const migrate = read('src/scripts/migrate.js');
  assert.ok(/ADD COLUMN IF NOT EXISTS destination/.test(sql));
  assert.ok(/DROP CONSTRAINT IF EXISTS purchase_invoices_status_check/.test(sql));
  assert.ok(/'posted'/.test(sql));
  assert.ok(/idx_inventory_txn_purchase_line/.test(sql));
  assert.ok(/idx_journal_entries_source_unique/.test(sql));
  assert.ok(/CREATE TABLE IF NOT EXISTS inventory_lots/.test(sql));
  assert.ok(/CREATE TABLE IF NOT EXISTS inventory_lot_receipts/.test(sql));
  assert.ok(/idx_inventory_lots_labeled/.test(sql));
  assert.ok(/idx_inventory_lot_receipt_purchase_line/.test(sql));
  assert.ok(/ACCESS EXCLUSIVE/.test(sql));
  assert.ok(/Do not backfill legacy/.test(sql));
  assert.ok(/unlabeled lots are never merged/i.test(sql));
  assert.ok(/refusing unique index/.test(sql));
  assert.ok(/RAISE EXCEPTION/.test(sql));
  assert.ok(/duplicate source groups/.test(sql));
  assert.ok(/unlabeled = true AND btrim\(COALESCE\(lot_number, ''\)\) = ''/.test(sql));
  assert.ok(/ON DELETE RESTRICT/.test(sql));
  assert.ok(!/ON DELETE CASCADE/.test(sql));
  assert.ok(!/CREATE EXTENSION IF NOT EXISTS/.test(sql));
  assert.ok(/INSERT INTO ledger_accounts \(code, name, name_ar, type, is_active\)[\s\S]{0,500}ON CONFLICT \(code\) DO NOTHING/.test(sql));
  assert.ok(/1170/.test(sql));
  assert.ok(/1200/.test(sql));
  assert.ok(/2000/.test(sql));
  assert.ok(/must not be used for purchase input tax/.test(sql));
  assert.ok(!migrate.includes('proposed-purchase-posting.sql'));
});

check('posting service is atomic and does not use adjustStock', () => {
  const src = read('src/services/purchase-posting.service.js');
  assert.ok(/FOR UPDATE/.test(src));
  assert.ok(/stock_applied_at = NOW\(\)/.test(src));
  assert.ok(/ledger_posted_at = NOW\(\)/.test(src));
  assert.ok(/PURCHASE_POSTING_INCONSISTENT/.test(src));
  assert.ok(/posting_replayed/.test(src));
  assert.ok(/assertDayOpen/.test(src));
  assert.ok(/createEntry/.test(src));
  assert.ok(/logPurchaseAudit/.test(src));
  assert.ok(!/adjustStock/.test(src));
  assert.ok(/inventory_lots/.test(src));
  assert.ok(/inventory_lot_receipts/.test(src));
  assert.ok(/Never write lot_number or expiry_date/.test(src));
  assert.ok(/debit_halalas/.test(src));
  assert.ok(/ROUND\(/.test(src));
  assert.ok(/\$3::numeric \/ 100/.test(src));
  assert.ok(/SAVEPOINT labeled_lot_insert/.test(src));
  assert.ok(/itemTotals/.test(src));
  assert.ok(!/parseFloat/.test(src));
  assert.ok(!/fromHalalas/.test(src));
  const purchases = read('src/services/purchases.service.js');
  assert.ok(/POSTED_PURCHASE_REQUIRES_REVERSAL/.test(purchases));
  assert.ok(!/adjustStock|postInvoice|postPayment/.test(purchases));
});

check('routes expose post before generic id handlers for lookup paths', () => {
  const routes = read('src/routes/purchases.routes.js');
  assert.ok(routes.indexOf("router.get('/posting/expense-accounts'") < routes.indexOf("router.get('/:id'"));
  assert.ok(/router.post\('\/:id\/post'/.test(routes));
  assert.ok(/router.put\('\/:id\/lines'/.test(routes));
  assert.ok(/PURCHASES_POST/.test(routes));
});

check('journal uses integer halalas and stored subtotal minus discount', () => {
  assert.equal(creditAccountCode('cash'), '1010');
  assert.equal(creditAccountCode('bank_transfer'), '1020');
  assert.equal(creditAccountCode('credit'), '2000');
  assert.equal(creditAccountCode('other'), '2000');
  assert.equal(SALES_VAT_PAYABLE_CODE, '2100');
  assert.equal(sarTextFromHalalas(1150), '11.50');
  const invoice = {
    subtotal_halalas: 1000,
    discount_halalas: 0,
    vat_halalas: 150,
    total_halalas: 1150,
  };
  const items = [
    { destination: 'inventory', line_net_halalas: 1000 },
  ];
  const lines = buildPurchaseJournalLines({
    invoice,
    items,
    inventoryAccountId: 'inv',
    inputVatAccountId: 'vat',
    creditAccountId: 'cash',
  });
  const debit = lines.reduce((sum, line) => sum + line.debit_halalas, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit_halalas, 0);
  assert.equal(debit, 1150);
  assert.equal(credit, 1150);
  assert.equal(lines.find((line) => line.role === 'inventory').debit, '10.00');
  assert.equal(lines.find((line) => line.role === 'input_vat').debit, '1.50');
  const preview = postingPreview({ invoice, items, creditCode: '1010' });
  assert.equal(preview.credit_equals_debit, true);
  assert.equal(preview.recoverable_vat_policy, RECOVERABLE_VAT_POLICY);
  assert.equal(preview.non_recoverable_vat_supported, false);
});

check('line nets must equal subtotal minus discount', () => {
  const invoice = {
    subtotal_halalas: 1000,
    discount_halalas: 100,
    vat_halalas: 135,
    total_halalas: 1035,
  };
  const items = [
    { destination: 'inventory', line_net_halalas: 900 },
  ];
  assertStoredTotals(invoice, items);
  assert.throws(
    () => assertStoredTotals({ ...invoice, discount_halalas: 0 }, items),
    (err) => err.code === 'PURCHASE_NETS_MISMATCH'
  );
});

check('mixed expense and inventory journal stays balanced', () => {
  const invoice = {
    subtotal_halalas: 300,
    discount_halalas: 0,
    vat_halalas: 0,
    total_halalas: 300,
  };
  const items = [
    { destination: 'inventory', line_net_halalas: 200 },
    { destination: 'expense', expense_account_id: 'exp', line_net_halalas: 100 },
  ];
  const lines = buildPurchaseJournalLines({
    invoice,
    items,
    inventoryAccountId: 'inv',
    inputVatAccountId: 'vat',
    creditAccountId: 'ap',
  });
  assert.equal(lines.filter((line) => line.role === 'input_vat').length, 0);
  const debit = lines.reduce((sum, line) => sum + line.debit_halalas, 0);
  assert.equal(debit, 300);
});

check('purchase-posting helpers do not use parseFloat or fromHalalas', () => {
  const util = read('src/utils/purchase-posting.js');
  const money = read('src/utils/money.js');
  const ledger = read('src/services/ledger.service.js');
  assert.ok(!/parseFloat/.test(util));
  assert.ok(!/fromHalalas/.test(util));
  assert.ok(/sarTextFromHalalas/.test(util));
  assert.ok(/Math.trunc\(abs \/ 100\)/.test(money));
  assert.ok(!/parseFloat/.test(money));
  assert.ok(/\$3::numeric \/ 100/.test(ledger) || /\(\$3::numeric \/ 100\)/.test(ledger));
});

check('cash purchase outflows are independent of net collections', () => {
  const accounting = read('src/services/accounting.service.js');
  const closing = read('src/services/daily-closing.service.js');
  const pdf = read('src/utils/closing-pdf.js');
  assert.ok(/cash_purchase_outflows/.test(accounting));
  assert.ok(/expected_cash/.test(accounting));
  assert.ok(/payment_method = 'cash'/.test(accounting));
  assert.ok(/posting_date = \$1::date/.test(accounting));
  assert.ok(!closing.includes('purchase_invoice'));
  assert.ok(/Cash purchase outflows/.test(pdf));
  assert.ok(/Expected cash/.test(pdf));
  assert.ok(/expectedCashHalalas/.test(accounting));
  assert.equal(expectedCashHalalas(10000, 1000, 2500), 6500);
  assert.equal(expectedCashHalalas(10000, 1000, 0), 9000);
});

check('lot alerts and AP limitations are documented in UI copy', () => {
  const inventory = read('src/services/inventory.service.js');
  const posting = read('src/services/purchase-posting.service.js');
  const page = read('../frontend/src/pages/Inventory.jsx');
  const i18n = read('../frontend/src/i18n/index.js');
  assert.ok(/inventory_lots/.test(inventory));
  assert.ok(/legacy_expiry_undetailed/.test(inventory));
  assert.ok(/legacy_unallocated_quantity/.test(inventory));
  assert.ok(/NEGATIVE_LEGACY_QUANTITY/.test(inventory));
  assert.ok(/source: 'legacy'/.test(inventory) || /'legacy'::text AS source/.test(inventory));
  assert.ok(!/item_unspecified/.test(inventory));
  assert.ok(/LEGACY_QTY_SQL/.test(inventory));
  assert.ok(/show_legacy_fields/.test(inventory));
  assert.ok(/unallocated_legacy_details/.test(inventory));
  assert.ok(/expiring_total/.test(inventory));
  assert.ok(/UNION ALL/.test(inventory));
  assert.ok(/countExpiringBalances/.test(inventory));
  assert.ok(/SOURCE_REQUIRED/.test(inventory));
  assert.ok(/INSUFFICIENT_LOT/.test(inventory));
  assert.ok(/source === 'fefo'/.test(inventory) || /'fefo'/.test(inventory));
  assert.ok(!/parseFloat/.test(inventory));
  assert.ok(!inventory.includes('purchase_invoice'));
  assert.ok(!/UPDATE suppliers/.test(posting));
  assert.ok(/'purchase_invoice'/.test(posting));
  assert.ok(/sourceFefo/.test(page));
  assert.ok(/legacyUnallocated/.test(page));
  assert.ok(/show_legacy_fields/.test(page));
  assert.ok(/alertSourceLot/.test(page));
  assert.ok(/alertSourceLegacy/.test(page));
  assert.ok(/params\.expiring = 'true'/.test(page));
  assert.ok(/PAGE_SIZE/.test(page));
  assert.ok(/setPagination/.test(page));
  assert.ok(/expiring_total/.test(page));
  assert.ok(/legacyFieldsLabel/.test(page));
  assert.ok(/legacyFieldsHint/.test(page));
  assert.ok(!/key: 'lot_number'/.test(page) || /expiringColumns/.test(page));
  assert.ok(!/limit:\s*100/.test(page));
  assert.ok(!/[\u0600-\u06FF]/.test(page));
  assert.ok(/Unallocated legacy stock details \(not a current lot\)/.test(i18n));
  assert.ok(/بيانات الرصيد القديم غير المفصل \(ليست دفعة حديثة\)/.test(i18n));
  assert.ok(/never split into lots/.test(i18n));
  assert.ok(/لا يغيّر أرصدة الدفعات المرحلة/.test(i18n));
  assert.ok(/Current lot/.test(i18n));
  assert.ok(/دفعة حالية/.test(i18n));
  assert.ok(/Unallocated legacy stock/.test(i18n));
  assert.ok(/رصيد قديم غير مفصّل/.test(i18n));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
