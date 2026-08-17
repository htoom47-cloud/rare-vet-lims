/**
 * Proposed purchase-posting SQL against a current-like schema.
 * Isolated schema. Does not write production data. Refuses hosted databases.
 * Usage: node src/scripts/verify-purchase-posting-schema.js
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

const skipCatalog = (statement) => (
  /INSERT INTO permissions|INSERT INTO role_permissions|INSERT INTO roles/i.test(statement)
);

const applySql = async (client, sql) => {
  for (const statement of splitSqlStatements(sql)) {
    if (skipCatalog(statement)) continue;
    await client.query(statement);
  }
};

const CURRENT_LIKE_SQL = `
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
`;

const run = async () => {
  refuseIfNotLocalTestDb();
  const db = require('../config/database');
  const root = path.join(__dirname, '../..');
  const schema = `post_schema_${Date.now()}`;
  const postingSql = fs.readFileSync(path.join(root, 'migrations/proposed-purchase-posting.sql'), 'utf8');
  const client = await db.getClient();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await applySql(client, CURRENT_LIKE_SQL);
    await applySql(client, fs.readFileSync(path.join(root, 'migrations/proposed-suppliers.sql'), 'utf8'));
    await applySql(client, fs.readFileSync(path.join(root, 'migrations/proposed-purchase-invoices.sql'), 'utf8'));

    const statusBefore = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'purchase_invoices'::regclass
         AND conname = 'purchase_invoices_status_check'`
    );
    assert.equal(statusBefore.rows[0]?.conname, 'purchase_invoices_status_check');
    assert.ok(/draft/.test(statusBefore.rows[0].def));
    assert.ok(/approved/.test(statusBefore.rows[0].def));
    assert.ok(!/'posted'/.test(statusBefore.rows[0].def));
    console.log('  ok  current status check name is purchase_invoices_status_check without posted');

    const item = await client.query(
      `INSERT INTO inventory_items (sku, name, category, quantity, lot_number, expiry_date, cost_per_unit)
       VALUES ('SKU-LEGACY', 'Legacy reagent', 'reagent', 7.50, 'OLD-LOT', '2026-12-31', 3.25)
       RETURNING *`
    );
    const txn = await client.query(
      `INSERT INTO inventory_transactions (item_id, type, quantity, lot_number, notes)
       VALUES ($1, 'in', 7.50, 'OLD-LOT', 'pre-feature stock')
       RETURNING *`,
      [item.rows[0].id]
    );
    const acc = await client.query(
      `INSERT INTO ledger_accounts (code, name, type) VALUES ('9999', 'Probe', 'asset') RETURNING *`
    );
    const journal = await client.query(
      `INSERT INTO journal_entries (description, source_type, source_id)
       VALUES ('pre-feature', 'invoice', $1)
       RETURNING *`,
      [item.rows[0].id]
    );
    const jline = await client.query(
      `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
       VALUES ($1, $2, 12.34, 0)
       RETURNING *`,
      [journal.rows[0].id, acc.rows[0].id]
    );
    const supplier = await client.query(`SELECT id FROM suppliers LIMIT 1`);
    const invoice = await client.query(
      `INSERT INTO purchase_invoices (
         document_number, supplier_id, supplier_invoice_number, invoice_date, status,
         subtotal_halalas, discount_halalas, vat_halalas, total_halalas
       ) VALUES ('PINV-LEGACY', $1, 'SUP-LEGACY', '2026-08-01', 'approved', 1000, 0, 150, 1150)
       RETURNING *`,
      [supplier.rows[0].id]
    );

    const snapshot = {
      item: item.rows[0],
      txn: txn.rows[0],
      journal: journal.rows[0],
      jline: jline.rows[0],
      invoice: invoice.rows[0],
    };

    const dupSource = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await client.query(
      `INSERT INTO journal_entries (description, source_type, source_id)
       VALUES ('dup-a', 'invoice', $1), ('dup-b', 'invoice', $1)`,
      [dupSource]
    );
    let duplicateFailed = false;
    try {
      await applySql(client, postingSql);
    } catch (err) {
      duplicateFailed = true;
      assert.ok(
        /duplicate source groups, refusing unique index/i.test(err.message),
        err.message
      );
    }
    assert.equal(duplicateFailed, true);
    console.log('  ok  unique journal index is refused when duplicates exist');

    await client.query(
      `DELETE FROM journal_entries WHERE source_id = $1`,
      [dupSource]
    );

    await applySql(client, postingSql);
    await applySql(client, postingSql);
    console.log('  ok  posting SQL applies twice without duplicating objects');

    const statusAfter = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'purchase_invoices'::regclass
         AND conname = 'purchase_invoices_status_check'`
    );
    assert.equal(statusAfter.rows[0].conname, 'purchase_invoices_status_check');
    assert.ok(/'posted'/.test(statusAfter.rows[0].def));
    console.log('  ok  status check keeps the same name and now includes posted');

    const itemAfter = await client.query('SELECT * FROM inventory_items WHERE id = $1', [snapshot.item.id]);
    const txnAfter = await client.query('SELECT * FROM inventory_transactions WHERE id = $1', [snapshot.txn.id]);
    const journalAfter = await client.query('SELECT * FROM journal_entries WHERE id = $1', [snapshot.journal.id]);
    const jlineAfter = await client.query('SELECT * FROM journal_lines WHERE id = $1', [snapshot.jline.id]);
    const invoiceAfter = await client.query('SELECT * FROM purchase_invoices WHERE id = $1', [snapshot.invoice.id]);

    assert.equal(Number(itemAfter.rows[0].quantity), 7.5);
    assert.equal(itemAfter.rows[0].lot_number, 'OLD-LOT');
    const expiry = itemAfter.rows[0].expiry_date;
    const expiryText = expiry instanceof Date
      ? `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}-${String(expiry.getDate()).padStart(2, '0')}`
      : String(expiry).slice(0, 10);
    assert.equal(expiryText, '2026-12-31');
    assert.equal(Number(txnAfter.rows[0].quantity), 7.5);
    assert.equal(txnAfter.rows[0].lot_number, 'OLD-LOT');
    assert.equal(txnAfter.rows[0].source_type, null);
    assert.equal(journalAfter.rows[0].description, 'pre-feature');
    assert.equal(Number(jlineAfter.rows[0].debit), 12.34);
    assert.equal(invoiceAfter.rows[0].status, 'approved');
    assert.equal(invoiceAfter.rows[0].total_halalas, 1150);
    assert.equal(invoiceAfter.rows[0].posting_date, null);
    console.log('  ok  existing inventory, journals, and invoices are unchanged');

    const fks = await client.query(
      `SELECT c.conname, c.confdeltype, rel.relname
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = rel.relnamespace
       WHERE n.nspname = $1
         AND c.contype = 'f'
         AND c.conname IN (
           'inventory_lots_inventory_item_id_fkey',
           'inventory_lot_receipts_lot_id_fkey',
           'inventory_transactions_lot_id_fkey',
           'purchase_invoice_items_inventory_item_id_fkey'
         )
       ORDER BY c.conname`,
      [schema]
    );
    assert.equal(fks.rows.length, 4);
    fks.rows.forEach((row) => {
      assert.equal(row.confdeltype, 'r', `${row.conname} should be RESTRICT`);
    });
    console.log('  ok  posting foreign keys use ON DELETE RESTRICT');

    assert.ok(/ACCESS EXCLUSIVE/.test(postingSql));
    const qtyType = await client.query(
      `SELECT numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'inventory_items' AND column_name = 'quantity'`,
      [schema]
    );
    assert.equal(Number(qtyType.rows[0].numeric_precision), 12);
    assert.equal(Number(qtyType.rows[0].numeric_scale), 3);
    console.log('  ok  quantity widened to NUMERIC(12,3); ACCESS EXCLUSIVE is documented');

    let unlabeledWithNumberFailed = false;
    try {
      await client.query(
        `INSERT INTO inventory_lots (inventory_item_id, lot_number, unlabeled, quantity)
         VALUES ($1, 'HAS-NUMBER', true, 0)`,
        [snapshot.item.id]
      );
    } catch (err) {
      unlabeledWithNumberFailed = err.code === '23514';
    }
    assert.equal(unlabeledWithNumberFailed, true);
    console.log('  ok  unlabeled=true with a lot number is rejected');

    const labeledNull = await client.query(
      `INSERT INTO inventory_lots (inventory_item_id, lot_number, expiry_date, unlabeled, quantity)
       VALUES ($1, 'NULL-EXP', NULL, false, 1)
       RETURNING id`,
      [snapshot.item.id]
    );
    let labeledDupFailed = false;
    try {
      await client.query(
        `INSERT INTO inventory_lots (inventory_item_id, lot_number, expiry_date, unlabeled, quantity)
         VALUES ($1, 'NULL-EXP', NULL, false, 1)`,
        [snapshot.item.id]
      );
    } catch (err) {
      labeledDupFailed = err.code === '23505';
    }
    assert.equal(labeledDupFailed, true);
    assert.ok(labeledNull.rows[0].id);
    console.log('  ok  labeled lots with NULL expiry are unique');

    console.log('\n=== Purchase posting schema: RAN and passed ===\n');
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
