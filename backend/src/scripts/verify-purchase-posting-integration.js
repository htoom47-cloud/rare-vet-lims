/**
 * Local PostgreSQL integration for purchase posting.
 * Isolated schema. Transactions ROLLBACK. Refuses hosted databases.
 * Usage: node src/scripts/verify-purchase-posting-integration.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../../rare-vet-lims/backend/.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

const { resetSuppliersSchemaCache } = require('../utils/suppliers-schema');
const { resetPurchasesSchemaCache } = require('../utils/purchases-schema');
const { labDay } = require('../utils/accounting-time');
const { splitSqlStatements } = require('../utils/sql-statements');

const refuseIfNotLocalTestDb = () => {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  if (/render\.com|amazonaws|railway\.app|neon\.tech|supabase|onrender\.com/i.test(url)) {
    throw new Error('REFUSED: connection looks like a hosted/production database');
  }
  if (url && !/localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error('REFUSED: DATABASE_URL/TEST_DATABASE_URL is not a local host');
  }
  if (!url && !/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error('REFUSED: DB_HOST is not local');
  }
};

const expectError = async (client, fn, code) => {
  await client.query('SAVEPOINT expect_posting_error');
  try {
    await fn();
    throw new Error(`expected SQL/app error ${code}`);
  } catch (err) {
    if (err.message === `expected SQL/app error ${code}`) throw err;
    assert.equal(err.code, code, err.message);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expect_posting_error');
  }
};

const skipCatalog = (statement) => (
  /INSERT INTO permissions|INSERT INTO role_permissions|INSERT INTO roles/i.test(statement)
);

const applySql = async (client, sql) => {
  for (const statement of splitSqlStatements(sql)) {
    if (skipCatalog(statement)) continue;
    await client.query(statement);
  }
};

const SUPPORTING_SQL = `
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  category VARCHAR(50) NOT NULL DEFAULT 'reagent',
  unit VARCHAR(50) DEFAULT 'unit',
  quantity DECIMAL(12,2) DEFAULT 0,
  min_quantity DECIMAL(12,2) DEFAULT 0,
  lot_number VARCHAR(100),
  expiry_date DATE,
  location VARCHAR(100),
  supplier VARCHAR(255),
  cost_per_unit DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES inventory_items(id),
  type VARCHAR(20) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  lot_number VARCHAR(100),
  reference VARCHAR(100),
  notes TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100),
  type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_date TIMESTAMPTZ DEFAULT NOW(),
  description VARCHAR(255),
  source_type VARCHAR(50),
  source_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  debit DECIMAL(12,2) DEFAULT 0,
  credit DECIMAL(12,2) DEFAULT 0
);
CREATE TABLE IF NOT EXISTS daily_closings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  closing_number VARCHAR(50) UNIQUE NOT NULL,
  closing_date DATE NOT NULL,
  totals JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'closed',
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

const line = (description, quantity, unitPrice, extras = {}) => ({
  description,
  quantity,
  unit_price_sar: unitPrice,
  discount_sar: extras.discount || 0,
  tax_category: extras.tax || 'standard',
});

const run = async () => {
  refuseIfNotLocalTestDb();
  resetSuppliersSchemaCache();
  resetPurchasesSchemaCache();
  const db = require('../config/database');
  const purchases = require('../services/purchases.service');
  const suppliers = require('../services/suppliers.service');
  const posting = require('../services/purchase-posting.service');
  const root = path.join(__dirname, '../..');
  const schema = `post_sec_${Date.now()}`;
  const setup = await db.getClient();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}, public`);
    await applySql(setup, SUPPORTING_SQL);
    await applySql(setup, fs.readFileSync(path.join(root, 'migrations/proposed-suppliers.sql'), 'utf8'));
    await applySql(setup, fs.readFileSync(path.join(root, 'migrations/proposed-purchase-invoices.sql'), 'utf8'));
    const postingSql = fs.readFileSync(path.join(root, 'migrations/proposed-purchase-posting.sql'), 'utf8');
    await applySql(setup, postingSql);
    await applySql(setup, postingSql);
  } finally {
    setup.release();
  }

  const userLookup = await db.getClient();
  let userId;
  try {
    userId = (await userLookup.query('SELECT id FROM users LIMIT 1')).rows[0]?.id;
  } finally {
    userLookup.release();
  }
  if (!userId) {
    const cleanup = await db.getClient();
    try { await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { cleanup.release(); }
    throw new Error('local DB has no users');
  }

  const accountant = {
    id: userId,
    role_name: 'accountant',
    permissions: ['purchases.view', 'purchases.create', 'purchases.approve', 'purchases.post', 'purchases.cancel', 'suppliers.view'],
  };
  const purchaser = {
    id: userId,
    role_name: 'purchaser',
    permissions: ['purchases.view', 'purchases.create', 'suppliers.view'],
  };

  const client = await db.getClient();
  try {
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query('BEGIN');

    const inv = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
       VALUES ('SKU-POST-1', 'Reagent A', 'reagent', 10, 5.00, true)
       RETURNING id, quantity, cost_per_unit`
    );
    const invId = inv.rows[0].id;
    const expense = await client.query(`SELECT id FROM ledger_accounts WHERE code = '5100'`);
    const expenseId = expense.rows[0].id;
    const cash = await suppliers.createQuick({
      name: 'Posting Supplier',
      tax_number: '300000000009991',
      confirm: true,
    }, userId, null, { client });

    const makeDraft = (suffix, items, payment = 'cash') => purchases.create({
      supplier_id: cash.id,
      supplier_invoice_number: suffix,
      invoice_date: '2026-08-17',
      payment_method: payment,
      items,
    }, accountant, { client });

    const approveAndLink = async (draft, lines) => {
      await purchases.approve(draft.id, accountant, { client });
      return posting.setLineDestinations(draft.id, lines, accountant, { client });
    };

    const stockOnly = await makeDraft('INV-ONLY', [line('Reagent', 10, 10)]);
    const linkedStock = await approveAndLink(stockOnly, [{
      id: (await purchases.getById(stockOnly.id, accountant, { client })).items[0].id,
      destination: 'inventory',
      inventory_item_id: invId,
      lot_number: 'LOT-1',
      expiry_date: '2027-01-31',
    }]);
    const postedStock = await posting.post(linkedStock.id, accountant, { client, body: { posting_date: labDay() } });
    assert.equal(postedStock.status, 'posted');
    assert.ok(postedStock.stock_applied_at && postedStock.ledger_posted_at);
    const afterInv = await client.query('SELECT quantity, cost_per_unit FROM inventory_items WHERE id = $1', [invId]);
    assert.equal(Number(afterInv.rows[0].quantity), 20);
    assert.equal(Number(afterInv.rows[0].cost_per_unit), 7.5);
    const txn = await client.query(
      `SELECT lot_number, expiry_date, source_type, source_line_id FROM inventory_transactions WHERE source_id = $1`,
      [postedStock.id]
    );
    assert.equal(txn.rows.length, 1);
    assert.equal(txn.rows[0].lot_number, 'LOT-1');
    assert.equal(txn.rows[0].source_type, 'purchase_invoice');
    const itemMeta = await client.query(
      'SELECT lot_number, expiry_date, quantity FROM inventory_items WHERE id = $1',
      [invId]
    );
    assert.equal(itemMeta.rows[0].lot_number, null);
    assert.equal(itemMeta.rows[0].expiry_date, null);
    const lotsAfterFirst = await client.query(
      'SELECT lot_number, expiry_date, quantity, unlabeled FROM inventory_lots WHERE inventory_item_id = $1',
      [invId]
    );
    assert.equal(lotsAfterFirst.rows.length, 1);
    assert.equal(lotsAfterFirst.rows[0].lot_number, 'LOT-1');
    assert.equal(Number(lotsAfterFirst.rows[0].quantity), 10);
    assert.equal(lotsAfterFirst.rows[0].unlabeled, false);
    const lotSum = Number((await client.query(
      'SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory_lots WHERE inventory_item_id = $1',
      [invId]
    )).rows[0].q);
    assert.equal(lotSum, 10);
    assert.equal(Number(itemMeta.rows[0].quantity), 20);
    const journals = await client.query(
      `SELECT id FROM journal_entries WHERE source_type = 'purchase_invoice' AND source_id = $1`,
      [postedStock.id]
    );
    assert.equal(journals.rows.length, 1);
    const replay = await posting.post(postedStock.id, accountant, { client, body: {} });
    assert.equal(replay.posting_replayed, true);
    const journals2 = await client.query(
      `SELECT COUNT(*)::int AS n FROM journal_entries WHERE source_type = 'purchase_invoice' AND source_id = $1`,
      [postedStock.id]
    );
    assert.equal(journals2.rows[0].n, 1);
    console.log('  ok  inventory-only post, weighted average, lot/expiry, replay');

    await expectError(client, () => purchases.cancel(postedStock.id, 'nope', accountant, { client }), 'POSTED_PURCHASE_REQUIRES_REVERSAL');
    console.log('  ok  posted cancel is blocked');

    const expDraft = await makeDraft('EXP-ONLY', [line('Cleaning', 1, 50, { tax: 'out_of_scope' })]);
    const expLinked = await approveAndLink(expDraft, [{
      id: (await purchases.getById(expDraft.id, accountant, { client })).items[0].id,
      destination: 'expense',
      expense_account_id: expenseId,
    }]);
    const postedExp = await posting.post(expLinked.id, accountant, { client, body: {} });
    const expTxn = await client.query('SELECT COUNT(*)::int AS n FROM inventory_transactions WHERE source_id = $1', [postedExp.id]);
    assert.equal(expTxn.rows[0].n, 0);
    assert.ok(postedExp.stock_applied_at && postedExp.ledger_posted_at);
    console.log('  ok  expense-only post does not change stock qty');

    const mix = await makeDraft('MIX', [
      line('Stock', 1, 10),
      line('Expense', 1, 20, { tax: 'zero_rated' }),
    ], 'credit');
    const mixItems = (await purchases.getById(mix.id, accountant, { client })).items;
    await approveAndLink(mix, [
      { id: mixItems[0].id, destination: 'inventory', inventory_item_id: invId },
      { id: mixItems[1].id, destination: 'expense', expense_account_id: expenseId },
    ]);
    const postedMix = await posting.post(mix.id, accountant, { client, body: {} });
    const mixLines = await client.query(
      `SELECT a.code, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN ledger_accounts a ON a.id = jl.account_id
       WHERE je.source_id = $1
       ORDER BY a.code, jl.debit DESC`,
      [postedMix.id]
    );
    const codes = mixLines.rows.map((row) => row.code);
    assert.ok(codes.includes('1200'));
    assert.ok(codes.includes('5100'));
    assert.ok(codes.includes('2000'));
    const debit = mixLines.rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = mixLines.rows.reduce((sum, row) => sum + Number(row.credit), 0);
    assert.equal(Number(debit.toFixed(2)), Number(credit.toFixed(2)));
    console.log('  ok  mixed invoice and credit payment');

    const bank = await makeDraft('BANK', [line('Bank item', 1, 8)], 'bank_transfer');
    const bankItem = (await purchases.getById(bank.id, accountant, { client })).items[0];
    await approveAndLink(bank, [{ id: bankItem.id, destination: 'inventory', inventory_item_id: invId }]);
    const postedBank = await posting.post(bank.id, accountant, { client, body: {} });
    const bankCredit = await client.query(
      `SELECT a.code FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN ledger_accounts a ON a.id = jl.account_id
       WHERE je.source_id = $1 AND jl.credit > 0`,
      [postedBank.id]
    );
    assert.equal(bankCredit.rows[0].code, '1020');
    console.log('  ok  bank transfer credits 1020');

    const disc = await makeDraft('DISC', [line('Discounted', 1, 10, { discount: 1 })]);
    const discItem = (await purchases.getById(disc.id, accountant, { client })).items[0];
    await approveAndLink(disc, [{ id: discItem.id, destination: 'inventory', inventory_item_id: invId }]);
    const postedDisc = await posting.post(disc.id, accountant, { client, body: {} });
    assert.ok(postedDisc.total_halalas < 1150);
    console.log('  ok  discounted line uses stored net');

    const unlinked = await makeDraft('UNLINK', [line('No dest', 1, 3)]);
    await purchases.approve(unlinked.id, accountant, { client });
    await expectError(client, () => posting.post(unlinked.id, accountant, { client, body: {} }), 'PURCHASE_LINE_UNLINKED');
    console.log('  ok  unlinked line is rejected');

    const badExp = await makeDraft('BADEXP', [line('Bad acc', 1, 3, { tax: 'out_of_scope' })]);
    const cashAcc = await client.query(`SELECT id FROM ledger_accounts WHERE code = '1010'`);
    const badItem = (await purchases.getById(badExp.id, accountant, { client })).items[0];
    await purchases.approve(badExp.id, accountant, { client });
    await expectError(client, () => posting.setLineDestinations(badExp.id, [{
      id: badItem.id,
      destination: 'expense',
      expense_account_id: cashAcc.rows[0].id,
    }], accountant, { client }), 'EXPENSE_ACCOUNT_INVALID');
    console.log('  ok  non-expense account is rejected');

    await expectError(client, () => posting.post(unlinked.id, purchaser, { client, body: {} }), 'FORBIDDEN');
    console.log('  ok  purchaser cannot post');

    const closed = await makeDraft('CLOSED', [line('Closed day', 1, 4)]);
    const closedItem = (await purchases.getById(closed.id, accountant, { client })).items[0];
    await approveAndLink(closed, [{ id: closedItem.id, destination: 'inventory', inventory_item_id: invId }]);
    await client.query(
      `INSERT INTO daily_closings (closing_number, closing_date, status) VALUES ('CL-TEST', $1::date, 'closed')`,
      [labDay()]
    );
    await expectError(client, () => posting.post(closed.id, accountant, { client, body: { posting_date: labDay() } }), 'DAY_CLOSED');
    await client.query(`DELETE FROM daily_closings WHERE closing_number = 'CL-TEST'`);
    console.log('  ok  closed posting day is rejected');

    const inconsistent = await makeDraft('INCONS', [line('Half', 1, 4)]);
    const incItem = (await purchases.getById(inconsistent.id, accountant, { client })).items[0];
    await approveAndLink(inconsistent, [{ id: incItem.id, destination: 'inventory', inventory_item_id: invId }]);
    await client.query('UPDATE purchase_invoices SET stock_applied_at = NOW() WHERE id = $1', [inconsistent.id]);
    await expectError(client, () => posting.post(inconsistent.id, accountant, { client, body: {} }), 'PURCHASE_POSTING_INCONSISTENT');
    await client.query('UPDATE purchase_invoices SET stock_applied_at = NULL WHERE id = $1', [inconsistent.id]);
    console.log('  ok  split timestamps refuse posting');

    const dupJ = await makeDraft('DUPJ', [line('Dup journal', 1, 6)]);
    const dupJItem = (await purchases.getById(dupJ.id, accountant, { client })).items[0];
    await approveAndLink(dupJ, [{ id: dupJItem.id, destination: 'inventory', inventory_item_id: invId }]);
    const qtyBefore = Number((await client.query('SELECT quantity FROM inventory_items WHERE id = $1', [invId])).rows[0].quantity);
    await client.query(
      `INSERT INTO journal_entries (description, source_type, source_id, created_by)
       VALUES ('pre', 'purchase_invoice', $1, $2)`,
      [dupJ.id, userId]
    );
    await expectError(client, () => posting.post(dupJ.id, accountant, { client, body: {} }), 'DUPLICATE_JOURNAL');
    const qtyAfterFail = Number((await client.query('SELECT quantity FROM inventory_items WHERE id = $1', [invId])).rows[0].quantity);
    assert.equal(qtyAfterFail, qtyBefore);
    console.log('  ok  journal failure rolls back stock');

    const dupS = await makeDraft('DUPS', [line('Dup stock', 1, 6)]);
    const dupSItem = (await purchases.getById(dupS.id, accountant, { client })).items[0];
    await approveAndLink(dupS, [{ id: dupSItem.id, destination: 'inventory', inventory_item_id: invId }]);
    const journalsBefore = Number((await client.query('SELECT COUNT(*)::int AS n FROM journal_entries')).rows[0].n);
    await client.query(
      `INSERT INTO inventory_transactions (item_id, type, quantity, source_type, source_id, source_line_id)
       VALUES ($1, 'in', 1, 'purchase_invoice', $2, $3)`,
      [invId, dupS.id, dupSItem.id]
    );
    await expectError(client, () => posting.post(dupS.id, accountant, { client, body: {} }), 'DUPLICATE_STOCK_APPLICATION');
    const journalsAfter = Number((await client.query('SELECT COUNT(*)::int AS n FROM journal_entries')).rows[0].n);
    assert.equal(journalsAfter, journalsBefore);
    console.log('  ok  stock unique failure rolls back journal');

    const noAudit = await makeDraft('NOAUDIT', [line('No actor', 1, 7)]);
    const noAuditItem = (await purchases.getById(noAudit.id, accountant, { client })).items[0];
    await approveAndLink(noAudit, [{ id: noAuditItem.id, destination: 'inventory', inventory_item_id: invId }]);
    const qtyAuditBefore = Number((await client.query('SELECT quantity FROM inventory_items WHERE id = $1', [invId])).rows[0].quantity);
    await expectError(
      client,
      () => posting.post(noAudit.id, { role_name: 'admin', permissions: ['purchases.post'] }, { client, body: {} }),
      'AUDIT_REQUIRED'
    );
    const qtyAuditAfter = Number((await client.query('SELECT quantity FROM inventory_items WHERE id = $1', [invId])).rows[0].quantity);
    assert.equal(qtyAuditAfter, qtyAuditBefore);
    console.log('  ok  audit failure rolls back stock and journal');

    const mergeItem = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
       VALUES ('SKU-LOT-MERGE', 'Lot merge', 'reagent', 0, 1.00, true)
       RETURNING id`
    );
    const mergeItemId = mergeItem.rows[0].id;
    const mergeA = await makeDraft('LOT-M1', [line('Merge A', 2, 4)]);
    const mergeAItem = (await purchases.getById(mergeA.id, accountant, { client })).items[0];
    await approveAndLink(mergeA, [{
      id: mergeAItem.id,
      destination: 'inventory',
      inventory_item_id: mergeItemId,
      lot_number: 'LOT-SHARE',
      expiry_date: '2027-06-01',
    }]);
    await posting.post(mergeA.id, accountant, { client, body: {} });
    const mergeB = await makeDraft('LOT-M2', [line('Merge B', 3, 4)]);
    const mergeBItem = (await purchases.getById(mergeB.id, accountant, { client })).items[0];
    await approveAndLink(mergeB, [{
      id: mergeBItem.id,
      destination: 'inventory',
      inventory_item_id: mergeItemId,
      lot_number: 'LOT-SHARE',
      expiry_date: '2027-06-01',
    }]);
    await posting.post(mergeB.id, accountant, { client, body: {} });
    const sharedLot = await client.query(
      `SELECT COUNT(*)::int AS n, SUM(quantity)::numeric AS q
       FROM inventory_lots
       WHERE inventory_item_id = $1 AND lot_number = 'LOT-SHARE' AND unlabeled = false`,
      [mergeItemId]
    );
    assert.equal(sharedLot.rows[0].n, 1);
    assert.equal(Number(sharedLot.rows[0].q), 5);
    console.log('  ok  labeled lots with the same identity merge');

    const unlabeledItem = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
       VALUES ('SKU-UNLAB', 'Unlabeled lots', 'reagent', 0, 1.00, true)
       RETURNING id`
    );
    const unlabeledId = unlabeledItem.rows[0].id;
    for (const suffix of ['U1', 'U2']) {
      const draft = await makeDraft(`UNLAB-${suffix}`, [line(`Unlab ${suffix}`, 1, 3)]);
      const draftItem = (await purchases.getById(draft.id, accountant, { client })).items[0];
      await approveAndLink(draft, [{
        id: draftItem.id,
        destination: 'inventory',
        inventory_item_id: unlabeledId,
        expiry_date: '2027-07-01',
      }]);
      await posting.post(draft.id, accountant, { client, body: {} });
    }
    const unlabeledLots = await client.query(
      `SELECT COUNT(*)::int AS n, SUM(quantity)::numeric AS q
       FROM inventory_lots WHERE inventory_item_id = $1 AND unlabeled = true`,
      [unlabeledId]
    );
    assert.equal(unlabeledLots.rows[0].n, 2);
    assert.equal(Number(unlabeledLots.rows[0].q), 2);
    const unlabeledItemQty = Number((await client.query(
      'SELECT quantity FROM inventory_items WHERE id = $1',
      [unlabeledId]
    )).rows[0].quantity);
    assert.equal(unlabeledItemQty, 2);
    console.log('  ok  unlabeled lots are not merged');

    const accounting = require('../services/accounting.service');
    const cashDay = '2026-08-10';
    assert.equal(await accounting.sumCashPurchaseOutflowsHalalas(cashDay, client), 0);
    const cashOut = await makeDraft('CASH-DAY', [line('Cash day', 1, 15)], 'cash');
    const cashOutItem = (await purchases.getById(cashOut.id, accountant, { client })).items[0];
    await approveAndLink(cashOut, [{ id: cashOutItem.id, destination: 'expense', expense_account_id: expenseId }]);
    const postedCashOut = await posting.post(cashOut.id, accountant, { client, body: { posting_date: cashDay } });
    assert.equal(Number(await accounting.sumCashPurchaseOutflowsHalalas(cashDay, client)), Number(postedCashOut.total_halalas));
    const bankDay = await makeDraft('BANK-DAY', [line('Bank day', 1, 20)], 'bank_transfer');
    const bankDayItem = (await purchases.getById(bankDay.id, accountant, { client })).items[0];
    await approveAndLink(bankDay, [{ id: bankDayItem.id, destination: 'expense', expense_account_id: expenseId }]);
    await posting.post(bankDay.id, accountant, { client, body: { posting_date: cashDay } });
    assert.equal(Number(await accounting.sumCashPurchaseOutflowsHalalas(cashDay, client)), Number(postedCashOut.total_halalas));
    const creditDay = await makeDraft('CREDIT-DAY', [line('Credit day', 1, 25)], 'credit');
    const creditDayItem = (await purchases.getById(creditDay.id, accountant, { client })).items[0];
    await approveAndLink(creditDay, [{ id: creditDayItem.id, destination: 'expense', expense_account_id: expenseId }]);
    await posting.post(creditDay.id, accountant, { client, body: { posting_date: cashDay } });
    assert.equal(Number(await accounting.sumCashPurchaseOutflowsHalalas(cashDay, client)), Number(postedCashOut.total_halalas));
    console.log('  ok  cash purchase outflows ignore bank and credit');

    await client.query(
      `INSERT INTO daily_closings (closing_number, closing_date, status) VALUES ('CL-CASH-DAY', $1::date, 'closed')`,
      [cashDay]
    );
    const afterClose = await makeDraft('CASH-AFTER-CLOSE', [line('Too late', 1, 9)], 'cash');
    const afterCloseItem = (await purchases.getById(afterClose.id, accountant, { client })).items[0];
    await approveAndLink(afterClose, [{ id: afterCloseItem.id, destination: 'expense', expense_account_id: expenseId }]);
    await expectError(
      client,
      () => posting.post(afterClose.id, accountant, { client, body: { posting_date: cashDay } }),
      'DAY_CLOSED'
    );
    assert.equal(Number(await accounting.sumCashPurchaseOutflowsHalalas(cashDay, client)), Number(postedCashOut.total_halalas));
    await client.query(`DELETE FROM daily_closings WHERE closing_number = 'CL-CASH-DAY'`);
    console.log('  ok  cash posting is blocked after the posting day is closed');

    const inventory = require('../services/inventory.service');
    const mergeLot = await client.query(
      `SELECT id, quantity FROM inventory_lots WHERE inventory_item_id = $1 AND lot_number = 'LOT-SHARE'`,
      [mergeItemId]
    );
    await inventory.adjustStock(mergeItemId, 'out', 1, userId, 'lot out', {
      client,
      source: 'lot',
      lot_id: mergeLot.rows[0].id,
    });
    assert.equal(Number((await client.query(
      'SELECT quantity FROM inventory_lots WHERE id = $1',
      [mergeLot.rows[0].id]
    )).rows[0].quantity), 4);
    assert.equal(Number((await client.query(
      'SELECT quantity FROM inventory_items WHERE id = $1',
      [mergeItemId]
    )).rows[0].quantity), 4);
    console.log('  ok  manual out from a selected lot');

    await expectError(client, () => inventory.adjustStock(mergeItemId, 'out', 99, userId, 'too much', {
      client,
      source: 'lot',
      lot_id: mergeLot.rows[0].id,
    }), 'INSUFFICIENT_LOT');
    console.log('  ok  cannot issue more than the lot balance');

    const adj = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
       VALUES ('SKU-ADJ', 'Adjust item', 'reagent', 10, 1.00, true)
       RETURNING id`
    );
    const adjId = adj.rows[0].id;
    await inventory.adjustStock(adjId, 'out', 3, userId, 'legacy out', { client, source: 'legacy' });
    assert.equal(Number((await client.query(
      'SELECT COUNT(*)::int AS n FROM inventory_lots WHERE inventory_item_id = $1',
      [adjId]
    )).rows[0].n), 0);
    assert.equal(Number((await client.query(
      'SELECT quantity FROM inventory_items WHERE id = $1',
      [adjId]
    )).rows[0].quantity), 7);
    console.log('  ok  legacy unallocated out does not invent a lot');

    await inventory.adjustStock(adjId, 'in', 2, userId, 'manual in', {
      client,
      lot_number: 'MAN-1',
      expiry_date: '2028-01-01',
    });
    await inventory.adjustStock(adjId, 'in', 2, userId, 'fefo late', {
      client,
      lot_number: 'FEFO-LATE',
      expiry_date: '2029-01-01',
    });
    await inventory.adjustStock(adjId, 'in', 2, userId, 'fefo soon', {
      client,
      lot_number: 'FEFO-SOON',
      expiry_date: '2027-01-01',
    });
    await inventory.adjustStock(adjId, 'out', 3, userId, 'fefo out', { client, source: 'fefo' });
    assert.equal(Number((await client.query(
      `SELECT quantity FROM inventory_lots WHERE inventory_item_id = $1 AND lot_number = 'FEFO-SOON'`,
      [adjId]
    )).rows[0].quantity), 0);
    assert.equal(Number((await client.query(
      `SELECT quantity FROM inventory_lots WHERE inventory_item_id = $1 AND lot_number = 'MAN-1'`,
      [adjId]
    )).rows[0].quantity), 1);
    assert.equal(Number((await client.query(
      `SELECT quantity FROM inventory_lots WHERE inventory_item_id = $1 AND lot_number = 'FEFO-LATE'`,
      [adjId]
    )).rows[0].quantity), 2);
    const adjBal = await client.query(
      `SELECT i.quantity AS item_qty,
              COALESCE((SELECT SUM(l.quantity) FROM inventory_lots l WHERE l.inventory_item_id = i.id), 0) AS lots_qty
       FROM inventory_items i WHERE i.id = $1`,
      [adjId]
    );
    assert.ok(Number(adjBal.rows[0].lots_qty) <= Number(adjBal.rows[0].item_qty));
    assert.equal(Number(adjBal.rows[0].item_qty) - Number(adjBal.rows[0].lots_qty), 7);
    console.log('  ok  FEFO consumes nearest expiry first; lots stay within item qty');

    const qtyBeforeAuditAdj = Number(adjBal.rows[0].item_qty);
    await expectError(client, () => inventory.adjustStock(adjId, 'in', 1, null, 'no actor', {
      client,
      lot_number: 'NO-AUDIT',
    }), 'AUDIT_REQUIRED');
    assert.equal(Number((await client.query(
      'SELECT quantity FROM inventory_items WHERE id = $1',
      [adjId]
    )).rows[0].quantity), qtyBeforeAuditAdj);
    assert.equal(Number((await client.query(
      `SELECT COUNT(*)::int AS n FROM inventory_lots WHERE inventory_item_id = $1 AND lot_number = 'NO-AUDIT'`,
      [adjId]
    )).rows[0].n), 0);
    console.log('  ok  audit failure rolls back item and lot together');

    const avgItem = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
       VALUES ('SKU-AVG3', 'Avg item', 'reagent', 1, 1.00, true)
       RETURNING id`
    );
    const avgDraft = await makeDraft('AVG3', [
      line('A', 1, 0.03, { tax: 'out_of_scope' }),
      line('B', 1, 0.03, { tax: 'out_of_scope' }),
      line('C', 1, 0.03, { tax: 'out_of_scope' }),
    ]);
    const avgLines = (await purchases.getById(avgDraft.id, accountant, { client })).items;
    await approveAndLink(avgDraft, avgLines.map((row) => ({
      id: row.id,
      destination: 'inventory',
      inventory_item_id: avgItem.rows[0].id,
      lot_number: 'LOT-AVG',
      expiry_date: '2027-08-01',
    })));
    await posting.post(avgDraft.id, accountant, { client, body: {} });
    const avgAfter = await client.query(
      'SELECT quantity, cost_per_unit FROM inventory_items WHERE id = $1',
      [avgItem.rows[0].id]
    );
    assert.equal(Number(avgAfter.rows[0].quantity), 4);
    assert.equal(Number(avgAfter.rows[0].cost_per_unit), 0.27);
    const avgLot = await client.query(
      `SELECT COUNT(*)::int AS n, SUM(quantity)::numeric AS q
       FROM inventory_lots WHERE inventory_item_id = $1 AND lot_number = 'LOT-AVG'`,
      [avgItem.rows[0].id]
    );
    assert.equal(avgLot.rows[0].n, 1);
    assert.equal(Number(avgLot.rows[0].q), 3);
    console.log('  ok  weighted average is rounded once across three lines');

    const nullExpItem = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
       VALUES ('SKU-NEXP', 'Null expiry', 'reagent', 0, 1.00, true)
       RETURNING id`
    );
    for (const suffix of ['E1', 'E2']) {
      const draft = await makeDraft(`NULL-${suffix}`, [line(`Null ${suffix}`, 1, 4, { tax: 'out_of_scope' })]);
      const draftItem = (await purchases.getById(draft.id, accountant, { client })).items[0];
      await approveAndLink(draft, [{
        id: draftItem.id,
        destination: 'inventory',
        inventory_item_id: nullExpItem.rows[0].id,
        lot_number: 'LOT-NULL',
      }]);
      await posting.post(draft.id, accountant, { client, body: {} });
    }
    const nullLots = await client.query(
      `SELECT COUNT(*)::int AS n, SUM(quantity)::numeric AS q
       FROM inventory_lots
       WHERE inventory_item_id = $1 AND lot_number = 'LOT-NULL' AND expiry_date IS NULL`,
      [nullExpItem.rows[0].id]
    );
    assert.equal(nullLots.rows[0].n, 1);
    assert.equal(Number(nullLots.rows[0].q), 2);
    console.log('  ok  labeled lots with NULL expiry merge');

    const day = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value.slice(0, 10);
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const date = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${date}`;
    };
    const dates = await client.query(
      `SELECT (CURRENT_DATE + 10)::text AS soon, (CURRENT_DATE + 400)::text AS far`
    );
    const soon = dates.rows[0].soon;
    const far = dates.rows[0].far;
    const insertExpItem = async (sku, qty, lotNumber, expiry) => {
      const row = await client.query(
        `INSERT INTO inventory_items (sku, name, category, quantity, lot_number, expiry_date, is_active)
         VALUES ($1, $2, 'reagent', $3, $4, $5, true)
         RETURNING id`,
        [sku, sku, qty, lotNumber, expiry]
      );
      return row.rows[0].id;
    };
    const insertExpLot = async (itemId, lotNumber, qty, expiry) => {
      await client.query(
        `INSERT INTO inventory_lots (inventory_item_id, lot_number, expiry_date, quantity, unlabeled)
         VALUES ($1, $2, $3, $4, false)`,
        [itemId, lotNumber, expiry, qty]
      );
    };

    const collectExpiring = async (pageSize = 20) => {
      const first = await inventory.list({ expiring: 'true', page: 1, limit: pageSize }, client);
      const total = first.pagination.total;
      const rows = [...first.data];
      for (let pageNo = 2; pageNo <= first.pagination.totalPages; pageNo += 1) {
        const next = await inventory.list({ expiring: 'true', page: pageNo, limit: pageSize }, client);
        assert.equal(next.pagination.total, total);
        assert.equal(next.pagination.page, pageNo);
        assert.equal(next.pagination.limit, pageSize);
        rows.push(...next.data);
      }
      return { total, rows, pagination: first.pagination };
    };
    const rowKey = (row) => row.row_key || `${row.source}:${row.lot_id || row.inventory_item_id}`;

    const soonLotItemId = await insertExpItem('SKU-EXP-LOT', 5, 'ITEM-OLD', far);
    await insertExpLot(soonLotItemId, 'LOT-SOON', 5, soon);
    const soonItem = await inventory.getById(soonLotItemId, client);
    assert.equal(soonItem.show_legacy_fields, false);
    assert.equal(soonItem.legacy_expiry_date, null);
    assert.equal(soonItem.unallocated_legacy_details, null);
    assert.equal(soonItem.lots.length, 1);
    const lotAlert = (await collectExpiring()).rows.find((row) => row.inventory_item_id === soonLotItemId);
    assert.equal(lotAlert.source, 'lot');
    assert.equal(lotAlert.lot_number, 'LOT-SOON');
    assert.equal(Number(lotAlert.remaining_quantity), 5);
    assert.equal(day(lotAlert.expiry_date), soon);
    assert.ok(!(await collectExpiring()).rows.some((row) => (
      row.inventory_item_id === soonLotItemId && row.source === 'legacy'
    )));
    console.log('  ok  positive current lot near expiry appears as source lot');

    const zeroLotItemId = await insertExpItem('SKU-EXP-ZERO', 0, null, null);
    await insertExpLot(zeroLotItemId, 'LOT-ZERO', 0, soon);
    assert.equal((await inventory.getById(zeroLotItemId, client)).lots.length, 0);
    assert.ok(!(await collectExpiring()).rows.some((row) => row.inventory_item_id === zeroLotItemId));
    console.log('  ok  zero-quantity lot is omitted from expiry UI');

    const leftoverId = await insertExpItem('SKU-EXP-LEG', 8, 'OLD-LOT', soon);
    await insertExpLot(leftoverId, 'LOT-FAR', 3, far);
    const leftoverItem = await inventory.getById(leftoverId, client);
    assert.equal(leftoverItem.show_legacy_fields, true);
    assert.equal(Number(leftoverItem.legacy_quantity), 5);
    assert.equal(day(leftoverItem.legacy_expiry_date), soon);
    const leftoverAlert = (await collectExpiring()).rows.find((row) => (
      row.inventory_item_id === leftoverId && row.source === 'legacy'
    ));
    assert.ok(leftoverAlert);
    assert.equal(Number(leftoverAlert.remaining_quantity), 5);
    assert.equal(leftoverAlert.lot_number, 'OLD-LOT');
    assert.ok(!(await collectExpiring()).rows.some((row) => (
      row.inventory_item_id === leftoverId && row.source === 'lot'
    )));
    console.log('  ok  leftover legacy with item expiry appears as source legacy only');

    const hiddenLegacyId = await insertExpItem('SKU-EXP-NLEG', 3, 'SHOULD-HIDE', soon);
    await insertExpLot(hiddenLegacyId, 'LOT-FAR-2', 3, far);
    const hiddenLegacy = await inventory.getById(hiddenLegacyId, client);
    assert.equal(hiddenLegacy.show_legacy_fields, false);
    assert.equal(hiddenLegacy.legacy_expiry_date, null);
    assert.ok(!(await collectExpiring()).rows.some((row) => row.inventory_item_id === hiddenLegacyId));
    assert.equal((await client.query(
      'SELECT lot_number FROM inventory_items WHERE id = $1',
      [hiddenLegacyId]
    )).rows[0].lot_number, 'SHOULD-HIDE');
    await inventory.update(hiddenLegacyId, { lot_number: 'HACKED', expiry_date: soon }, { client });
    assert.equal((await client.query(
      'SELECT lot_number FROM inventory_items WHERE id = $1',
      [hiddenLegacyId]
    )).rows[0].lot_number, 'SHOULD-HIDE');
    assert.equal((await client.query(
      'SELECT lot_number FROM inventory_lots WHERE inventory_item_id = $1',
      [hiddenLegacyId]
    )).rows[0].lot_number, 'LOT-FAR-2');
    console.log('  ok  leftover 0 hides item expiry and does not apply it to current lots');

    const bothId = await insertExpItem('SKU-EXP-BOTH', 6, 'OLD-BOTH', soon);
    await insertExpLot(bothId, 'LOT-BOTH-SOON', 2, soon);
    const bothRows = (await collectExpiring()).rows.filter((row) => row.inventory_item_id === bothId);
    assert.equal(bothRows.length, 2);
    assert.ok(bothRows.some((row) => row.source === 'lot' && row.lot_number === 'LOT-BOTH-SOON'));
    assert.ok(bothRows.some((row) => row.source === 'legacy' && Number(row.remaining_quantity) === 4));
    console.log('  ok  item is listed once while alerts keep lot and legacy sources');

    const matched = await collectExpiring();
    const alertTotal = (await inventory.getAlerts(client)).expiring_total;
    assert.equal(matched.total, alertTotal);
    assert.equal(matched.rows.length, matched.total);
    console.log('  ok  expiring list filter matches alert item ids');

    await inventory.update(leftoverId, { lot_number: 'LEGACY-META', expiry_date: soon }, { client });
    const lotAfterLegacyUpdate = await client.query(
      'SELECT lot_number, quantity FROM inventory_lots WHERE inventory_item_id = $1',
      [leftoverId]
    );
    assert.equal(lotAfterLegacyUpdate.rows[0].lot_number, 'LOT-FAR');
    assert.equal(Number(lotAfterLegacyUpdate.rows[0].quantity), 3);
    assert.equal((await client.query(
      'SELECT lot_number FROM inventory_items WHERE id = $1',
      [leftoverId]
    )).rows[0].lot_number, 'LEGACY-META');
    console.log('  ok  editing leftover metadata does not change inventory_lots');

    const pageItem = await insertExpItem('SKU-EXP-PAGE', 105, null, null);
    const pageValues = [];
    const pageArgs = [];
    for (let i = 1; i <= 105; i += 1) {
      pageArgs.push(pageItem, `LOT-P-${String(i).padStart(3, '0')}`, soon, 1);
      const base = (i - 1) * 4;
      pageValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, false)`);
    }
    await client.query(
      `INSERT INTO inventory_lots (inventory_item_id, lot_number, expiry_date, quantity, unlabeled)
       VALUES ${pageValues.join(',')}`,
      pageArgs
    );
    const paged = await collectExpiring(20);
    const pagedAlerts = await inventory.getAlerts(client);
    assert.ok(paged.total > 100);
    assert.equal(paged.total, pagedAlerts.expiring_total);
    assert.equal(paged.rows.length, paged.total);
    assert.equal(paged.pagination.limit, 20);
    assert.ok(paged.pagination.totalPages > 5);
    const keys = paged.rows.map(rowKey);
    assert.equal(new Set(keys).size, paged.rows.length);
    assert.equal(paged.rows.filter((row) => row.inventory_item_id === pageItem && row.source === 'lot').length, 105);
    const firstPage = await inventory.list({ expiring: 'true', page: 1, limit: 20 }, client);
    const lastPage = await inventory.list({ expiring: 'true', page: paged.pagination.totalPages, limit: 20 }, client);
    assert.equal(firstPage.pagination.total, lastPage.pagination.total);
    assert.equal(firstPage.data.length, 20);
    assert.ok(lastPage.data.length > 0);
    assert.ok(lastPage.data.length < 20 || paged.total % 20 === 0);
    console.log('  ok  more than 100 expiring rows paginate without dropping or duplicating');

    const negId = await insertExpItem('SKU-EXP-NEG', 1, null, null);
    await insertExpLot(negId, 'LOT-OVER', 5, far);
    await expectError(client, () => inventory.getById(negId, client), 'NEGATIVE_LEGACY_QUANTITY');
    await expectError(client, () => inventory.list({}, client), 'NEGATIVE_LEGACY_QUANTITY');
    await expectError(client, () => inventory.getAlerts(client), 'NEGATIVE_LEGACY_QUANTITY');
    console.log('  ok  negative leftover quantity is rejected');

    await client.query('ROLLBACK');
    console.log('  ok  main posting cases rolled back');

    const origGet = db.getClient.bind(db);
    db.getClient = async () => {
      const wrapped = await origGet();
      await wrapped.query(`SET search_path TO ${schema}, public`);
      return wrapped;
    };
    try {
      const raceInv = await client.query(
        `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
         VALUES ('SKU-RACE', 'Race item', 'reagent', 0, 1.00, true)
         RETURNING id`
      );
      const raceSupplier = await suppliers.createQuick({
        name: 'Race Supplier',
        tax_number: '300000000009992',
        confirm: true,
      }, userId);
      const raceDraft = await purchases.create({
        supplier_id: raceSupplier.id,
        supplier_invoice_number: 'RACE-1',
        invoice_date: '2026-08-17',
        payment_method: 'cash',
        items: [line('Race', 1, 5)],
      }, accountant);
      await purchases.approve(raceDraft.id, accountant);
      const raceItem = (await purchases.getById(raceDraft.id, accountant)).items[0];
      await posting.setLineDestinations(raceDraft.id, [{
        id: raceItem.id,
        destination: 'inventory',
        inventory_item_id: raceInv.rows[0].id,
      }], accountant);
      const raced = await Promise.allSettled([
        posting.post(raceDraft.id, accountant, { body: {} }),
        posting.post(raceDraft.id, accountant, { body: {} }),
      ]);
      const fulfilled = raced.filter((row) => row.status === 'fulfilled');
      const rejected = raced.filter((row) => row.status === 'rejected');
      assert.ok(fulfilled.length >= 1, 'at least one concurrent post succeeds');
      fulfilled.forEach((row) => assert.equal(row.value.status, 'posted'));
      rejected.forEach((row) => {
        assert.ok(['DUPLICATE_JOURNAL', 'DUPLICATE_STOCK_APPLICATION', 'DUPLICATE_LOT_RECEIPT'].includes(row.reason.code), row.reason.code);
      });
      const raceJournals = await client.query(
        `SELECT COUNT(*)::int AS n FROM journal_entries WHERE source_id = $1`,
        [raceDraft.id]
      );
      assert.equal(raceJournals.rows[0].n, 1);
      console.log('  ok  concurrent post does not duplicate stock or journal');

      const lotRaceInv = await client.query(
        `INSERT INTO inventory_items (sku, name, category, quantity, cost_per_unit, is_active)
         VALUES ('SKU-LOT-RACE', 'Lot race', 'reagent', 0, 1.00, true)
         RETURNING id`
      );
      const makeRace = async (suffix) => {
        const draft = await purchases.create({
          supplier_id: raceSupplier.id,
          supplier_invoice_number: `LOT-RACE-${suffix}`,
          invoice_date: '2026-08-17',
          payment_method: 'cash',
          items: [line(`Race lot ${suffix}`, 2, 5, { tax: 'out_of_scope' })],
        }, accountant);
        await purchases.approve(draft.id, accountant);
        const item = (await purchases.getById(draft.id, accountant)).items[0];
        await posting.setLineDestinations(draft.id, [{
          id: item.id,
          destination: 'inventory',
          inventory_item_id: lotRaceInv.rows[0].id,
          lot_number: 'LOT-CONCUR',
          expiry_date: '2028-05-01',
        }], accountant);
        return draft;
      };
      const raceA = await makeRace('A');
      const raceB = await makeRace('B');
      const lotRaced = await Promise.allSettled([
        posting.post(raceA.id, accountant, { body: {} }),
        posting.post(raceB.id, accountant, { body: {} }),
      ]);
      lotRaced.forEach((row) => {
        if (row.status === 'rejected') throw row.reason;
      });
      assert.equal(lotRaced.filter((row) => row.status === 'fulfilled').length, 2);
      const concurLots = await client.query(
        `SELECT COUNT(*)::int AS n, SUM(quantity)::numeric AS q
         FROM inventory_lots
         WHERE inventory_item_id = $1 AND lot_number = 'LOT-CONCUR'`,
        [lotRaceInv.rows[0].id]
      );
      assert.equal(concurLots.rows[0].n, 1);
      assert.equal(Number(concurLots.rows[0].q), 4);
      const concurJournals = await client.query(
        `SELECT COUNT(*)::int AS n FROM journal_entries WHERE source_id = ANY($1::uuid[])`,
        [[raceA.id, raceB.id]]
      );
      assert.equal(concurJournals.rows[0].n, 2);
      console.log('  ok  concurrent labeled-lot posts merge into one lot with two journals');
    } finally {
      db.getClient = origGet;
    }
    console.log('\n=== Purchase posting integration: RAN and passed (ROLLBACK) ===\n');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } catch (_) { /* ignore */ }
    client.release();
    await db.pool.end();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
