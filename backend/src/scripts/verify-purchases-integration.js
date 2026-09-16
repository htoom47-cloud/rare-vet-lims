/**
 * Local PostgreSQL integration for purchase invoice drafts.
 * Uses an isolated schema. Data transactions end with ROLLBACK except
 * concurrent cases, which delete their leftover rows.
 * Refuses hosted/production hosts.
 *
 * Usage: node src/scripts/verify-purchases-integration.js
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
const purchasesSchema = require('../utils/purchases-schema');
const { resetPurchasesSchemaCache } = purchasesSchema;

const splitSqlStatements = (sql) => {
  const parts = [];
  let current = '';
  for (let i = 0; i < sql.length; i += 1) {
    if (sql[i] === ';') {
      const statement = current.trim();
      if (statement && !statement.split('\n').every((line) => !line.trim() || line.trim().startsWith('--'))) {
        parts.push(statement);
      }
      current = '';
      continue;
    }
    current += sql[i];
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

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

const setSearchPath = (client, schema) => client.query(`SET search_path TO ${schema}, public`);

const wrapClient = (client) => ({
  query: (...args) => client.query(...args),
  release() {},
});

const skipCatalog = (statement) => (
  /INSERT INTO permissions|INSERT INTO role_permissions|INSERT INTO roles/i.test(statement)
);

const applySql = async (client, sql) => {
  for (const statement of splitSqlStatements(sql)) {
    if (skipCatalog(statement)) continue;
    await client.query(statement);
  }
};

const applyCatalog = async (client, sql) => {
  for (const statement of splitSqlStatements(sql)) {
    if (/INSERT INTO permissions|INSERT INTO role_permissions|INSERT INTO roles/i.test(statement)) {
      await client.query(statement);
    }
  }
};

const draftBody = (supplierId, suffix, extras = {}) => ({
  supplier_id: supplierId,
  supplier_invoice_number: `PINV-${suffix}`,
  invoice_date: '2026-08-15',
  payment_method: 'cash',
  items: [{ description: `Item ${suffix}`, quantity: 2, unit_price_sar: 10 }],
  ...extras,
});

const run = async () => {
  refuseIfNotLocalTestDb();
  resetSuppliersSchemaCache();
  resetPurchasesSchemaCache();

  const db = require('../config/database');
  const { getClient, pool } = db;
  const suppliers = require('../services/suppliers.service');
  const purchases = require('../services/purchases.service');
  const purchasesAudit = require('../utils/purchases-audit');

  const suppliersSql = fs.readFileSync(
    path.join(__dirname, '../../migrations/proposed-suppliers.sql'),
    'utf8'
  );
  const purchasesSql = fs.readFileSync(
    path.join(__dirname, '../../migrations/proposed-purchase-invoices.sql'),
    'utf8'
  );

  const schema = `purchases_sec_${Date.now()}`;
  const setup = await getClient();
  try {
    await setup.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'purchases_sec_%'
        LOOP
          EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.nspname);
        END LOOP;
      END $$;
    `);
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setSearchPath(setup, schema);
    await applySql(setup, suppliersSql);
    await applySql(setup, purchasesSql);
  } finally {
    setup.release();
  }

  const userLookup = await getClient();
  let userId;
  try {
    const userRow = await userLookup.query('SELECT id FROM users LIMIT 1');
    userId = userRow.rows[0]?.id;
  } finally {
    userLookup.release();
  }
  if (!userId) {
    const cleanup = await getClient();
    try { await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { cleanup.release(); }
    throw new Error('local DB has no users; cannot run purchases integration');
  }

  const purchaser = {
    id: userId,
    role_name: 'purchaser',
    permissions: ['purchases.view', 'purchases.create', 'suppliers.view'],
  };
  const accountant = {
    id: userId,
    role_name: 'accountant',
    permissions: ['purchases.view', 'purchases.create', 'purchases.approve', 'purchases.cancel'],
  };
  const manager = {
    id: userId,
    role_name: 'manager',
    permissions: ['purchases.view', 'purchases.create', 'purchases.approve', 'purchases.cancel'],
  };
  const admin = {
    id: userId,
    role_name: 'admin',
    permissions: [],
  };
  const otherPurchaser = {
    id: '00000000-0000-4000-8000-000000000099',
    role_name: 'purchaser',
    permissions: ['purchases.view', 'purchases.create'],
  };

  try {
    const legacy = `purchases_legacy_${Date.now()}`;
    const legacySetup = await getClient();
    try {
      await legacySetup.query(`CREATE SCHEMA ${legacy}`);
      await setSearchPath(legacySetup, legacy);
      await applySql(legacySetup, suppliersSql);
    } finally {
      legacySetup.release();
    }

    const legacyClient = await getClient();
    try {
      await setSearchPath(legacyClient, legacy);
      await legacyClient.query('BEGIN');
      const regular = await suppliers.create({
        name: 'Legacy Co',
        name_ar: 'شركة قديمة',
        tax_number: '300000000001111',
      }, userId, null, { client: legacyClient });
      assert.ok(regular.supplier_number.startsWith('SUP-'));
      assert.equal(regular.is_temporary, false);

      const listed = await suppliers.list({ search: regular.supplier_number }, { client: legacyClient });
      assert.equal(listed.data.length, 1);

      let quickBlocked = false;
      try {
        await suppliers.createQuick({ name: 'Quick Co', confirm: true }, userId, null, { client: legacyClient });
      } catch (err) {
        quickBlocked = err.code === 'PURCHASES_MIGRATION_REQUIRED';
      }
      assert.ok(quickBlocked, 'quick supplier must wait for purchase columns');

      let cashBlocked = false;
      try {
        await suppliers.getCashUnregistered({ client: legacyClient });
      } catch (err) {
        cashBlocked = err.code === 'PURCHASES_MIGRATION_REQUIRED';
      }
      assert.ok(cashBlocked, 'cash supplier must wait for purchase columns');

      let searchBlocked = false;
      try {
        await suppliers.searchQuick({ q: 'Legacy' }, { client: legacyClient });
      } catch (err) {
        searchBlocked = err.code === 'PURCHASES_MIGRATION_REQUIRED';
      }
      assert.ok(searchBlocked);

      await legacyClient.query('ROLLBACK');
      await applySql(legacyClient, purchasesSql);
      await legacyClient.query('BEGIN');
      const migrated = await suppliers.createQuick({
        name: 'Quick After',
        tax_number: '300000000002222',
        confirm: true,
      }, userId, null, { client: legacyClient });
      assert.equal(migrated.is_temporary, true);
      const after = await purchases.create(draftBody(migrated.id, 'LEG'), purchaser, null, { client: legacyClient });
      assert.equal(after.items[0].tax_category, 'standard');
      assert.equal(after.items[0].tax_rate, 15);
      assert.equal(after.vat_halalas, 300);
      await legacyClient.query('ROLLBACK');
      console.log('  ok  legacy suppliers table works, then purchase migration unlocks quick suppliers');
    } finally {
      legacyClient.release();
      const dropLegacy = await getClient();
      try { await dropLegacy.query(`DROP SCHEMA IF EXISTS ${legacy} CASCADE`); } finally { dropLegacy.release(); }
    }

    const client = await getClient();
    let rolledBack = false;
    try {
      await setSearchPath(client, schema);
      await client.query('BEGIN');

      let confirmBlocked = false;
      try {
        await suppliers.createQuick({ name: 'Temp Co', confirm: false }, userId, null, { client });
      } catch (err) {
        confirmBlocked = err.code === 'CONFIRM_REQUIRED';
      }
      assert.ok(confirmBlocked, 'quick supplier must require confirm');

      const quick = await suppliers.createQuick({
        name: 'Temp Co',
        tax_number: '300000000008881',
        phone: '0500000001',
        confirm: true,
      }, userId, null, { client });
      assert.equal(quick.is_temporary, true);
      assert.ok(quick.supplier_number.startsWith('SUP-'));

      let duplicateTax = false;
      try {
        await suppliers.createQuick({
          name: 'Other Co',
          tax_number: '300000000008881',
          confirm: true,
        }, userId, null, { client });
      } catch (err) {
        duplicateTax = err.code === 'DUPLICATE_TAX_NUMBER';
      }
      assert.ok(duplicateTax, 'duplicate tax number must be rejected');

      const byTax = await suppliers.searchQuick({ tax_number: '300000000008881' }, { client });
      assert.equal(byTax.match, 'tax_number');
      assert.equal(byTax.data[0].id, quick.id);

      const cash = await suppliers.getCashUnregistered({ client });
      assert.equal(cash.supplier_number, 'SUP-CASH-UNREG');
      assert.equal(cash.is_system, true);
      assert.equal(cash.tax_number, null);

      let freeRateBlocked = false;
      try {
        await purchases.create({
          ...draftBody(quick.id, 'VAT5'),
          items: [{ description: 'Free', quantity: 1, unit_price_sar: 10, tax_rate: 5 }],
        }, purchaser, null, { client });
      } catch (err) {
        freeRateBlocked = err.code === 'INVALID_TAX_RATE';
      }
      assert.ok(freeRateBlocked, 'free tax rates must be rejected');

      const vat15 = await purchases.create(draftBody(quick.id, 'T15'), purchaser, null, { client });
      assert.equal(vat15.items[0].tax_category, 'standard');
      assert.equal(vat15.vat_halalas, 300);
      assert.equal(vat15.tax_summary[0].tax_rate, 15);

      const vat0 = await purchases.create({
        ...draftBody(quick.id, 'T0'),
        items: [{ description: 'No VAT', quantity: 1, unit_price_sar: 10, tax_category: 'exempt' }],
      }, purchaser, null, { client });
      assert.equal(vat0.vat_halalas, 0);
      assert.equal(vat0.total_halalas, 1000);
      assert.equal(vat0.items[0].tax_category, 'exempt');
      assert.ok(vat0.tax_summary.every((row) => row.tax_category !== 'zero_rated' || row.tax_rate === 0));

      const mixed = await purchases.create({
        ...draftBody(quick.id, 'TMIX'),
        items: [
          { description: 'Std', quantity: 1, unit_price_sar: 10, tax_category: 'standard' },
          { description: 'Ex', quantity: 1, unit_price_sar: 10, tax_category: 'exempt' },
        ],
      }, purchaser, null, { client });
      assert.equal(mixed.subtotal_halalas, 2000);
      assert.equal(mixed.vat_halalas, 150);
      assert.equal(mixed.total_halalas, 2150);
      assert.equal(mixed.tax_summary.length, 2);

      const rounded = await purchases.create({
        ...draftBody(quick.id, 'TROUND'),
        items: [{ description: 'R', quantity: 1, unit_price_sar: 10.01, tax_category: 'standard' }],
      }, purchaser, null, { client });
      assert.equal(rounded.subtotal_halalas, 1001);
      assert.equal(rounded.vat_halalas, 150);
      assert.equal(rounded.total_halalas, 1151);

      const discounted = await purchases.create({
        ...draftBody(quick.id, 'TDISC'),
        discount_sar: 3,
        items: [{ description: 'A', quantity: 2, unit_price_sar: 10, discount_sar: 1, tax_category: 'standard' }],
      }, purchaser, null, { client });
      assert.equal(discounted.subtotal_halalas, 1900);
      assert.equal(discounted.discount_halalas, 300);
      assert.equal(discounted.vat_halalas, 240);
      assert.equal(discounted.total_halalas, 1840);
      assert.equal(
        discounted.subtotal_halalas - discounted.discount_halalas + discounted.vat_halalas,
        discounted.total_halalas
      );

      let zeroQty = false;
      try {
        await purchases.create({
          ...draftBody(quick.id, 'Q0'),
          items: [{ description: 'Empty', quantity: 0, unit_price_sar: 10 }],
        }, purchaser, null, { client });
      } catch (err) {
        zeroQty = err.code === 'INVALID_QUANTITY' || err.statusCode === 400;
      }
      assert.ok(zeroQty, 'zero quantity must be rejected');

      const created = await purchases.create(draftBody(quick.id, 'A'), purchaser, null, { client });
      assert.equal(created.status, 'draft');
      assert.equal(created.subtotal_halalas, 2000);
      assert.equal(created.vat_halalas, 300);
      assert.equal(created.total_halalas, 2300);
      assert.equal(created.subtotal_halalas - created.discount_halalas + created.vat_halalas, created.total_halalas);
      assert.equal(created.stock_applied_at, null);
      assert.equal(created.ledger_posted_at, null);

      const updated = await purchases.update(created.id, {
        ...draftBody(quick.id, 'A'),
        notes: 'updated',
        items: [{ description: 'Item A', quantity: 1, unit_price_sar: 20 }],
      }, purchaser, null, { client });
      assert.equal(updated.notes, 'updated');
      assert.equal(updated.total_halalas, 2300);

      const listedOwn = await purchases.list({ search: created.document_number }, purchaser, { client });
      assert.equal(listedOwn.data.length, 1);
      const listedOther = await purchases.list({}, otherPurchaser, { client });
      assert.equal(listedOther.data.length, 0);
      const listedAcct = await purchases.list({ search: created.document_number }, accountant, { client });
      assert.equal(listedAcct.data.length, 1);
      const listedMgr = await purchases.list({ search: created.document_number }, manager, { client });
      assert.equal(listedMgr.data.length, 1);
      const listedAdmin = await purchases.list({ search: created.document_number }, admin, { client });
      assert.equal(listedAdmin.data.length, 1);

      const similar = await purchases.create({
        ...draftBody(quick.id, 'B'),
        invoice_date: created.invoice_date,
        items: [{ description: 'Clone', quantity: 1, unit_price_sar: 20 }],
      }, purchaser, null, { client });
      assert.ok(similar.warnings.some((w) => w.code === 'SIMILAR_INVOICE'));

      const cashDraft = await purchases.create({
        uses_cash_unregistered: true,
        supplier_invoice_number: 'CASH-1',
        invoice_date: '2026-08-15',
        items: [{ description: 'Petty', quantity: 1, unit_price_sar: 5 }],
      }, purchaser, null, { client });
      assert.equal(cashDraft.uses_cash_unregistered, true);
      assert.equal(cashDraft.supplier_id, cash.id);
      assert.equal(cashDraft.items[0].tax_category, 'out_of_scope');
      assert.equal(cashDraft.vat_halalas, 0);
      assert.equal(cashDraft.total_halalas, 500);

      const cashChosen = await purchases.create({
        uses_cash_unregistered: true,
        supplier_invoice_number: 'CASH-STD',
        invoice_date: '2026-08-15',
        items: [{ description: 'Chosen VAT', quantity: 1, unit_price_sar: 10, tax_category: 'standard' }],
      }, purchaser, null, { client });
      assert.equal(cashChosen.vat_halalas, 150);
      assert.equal(cashChosen.items[0].tax_category, 'standard');

      const approved = await purchases.approve(created.id, accountant, null, { client });
      assert.equal(approved.status, 'approved');
      assert.ok(approved.approved_at);
      assert.equal(approved.stock_applied_at, null);
      assert.equal(approved.ledger_posted_at, null);

      let approvedCancelBlocked = false;
      try {
        await purchases.cancel(created.id, '', accountant, null, { client });
      } catch (err) {
        approvedCancelBlocked = err.code === 'CANCEL_REASON_REQUIRED';
      }
      assert.ok(approvedCancelBlocked, 'approved cancel requires a reason');

      let lockedUpdate = false;
      try {
        await purchases.update(created.id, draftBody(quick.id, 'A-EDIT'), purchaser, null, { client });
      } catch (err) {
        lockedUpdate = err.code === 'INVOICE_LOCKED';
      }
      assert.ok(lockedUpdate, 'approved invoice must not be editable');

      let lockedDelete = false;
      try {
        await purchases.softDelete(created.id, purchaser, null, { client });
      } catch (err) {
        lockedDelete = err.code === 'INVOICE_LOCKED';
      }
      assert.ok(lockedDelete, 'approved invoice must not be deleted');

      const twin = await purchases.create(draftBody(quick.id, 'A'), purchaser, null, { client });
      let duplicateInvoice = false;
      try {
        await purchases.approve(twin.id, accountant, null, { client });
      } catch (err) {
        duplicateInvoice = err.code === 'DUPLICATE_SUPPLIER_INVOICE';
      }
      assert.ok(duplicateInvoice, 'same supplier invoice number cannot be approved twice');

      let purchaserApprove = false;
      try {
        await purchases.approve(similar.id, purchaser, null, { client });
      } catch (err) {
        purchaserApprove = err.code === 'FORBIDDEN';
      }
      assert.ok(purchaserApprove, 'purchaser must not approve');

      let purchaserCancel = false;
      try {
        await purchases.cancel(similar.id, 'no', purchaser, null, { client });
      } catch (err) {
        purchaserCancel = err.code === 'FORBIDDEN';
      }
      assert.ok(purchaserCancel, 'purchaser must not cancel');

      const cancelled = await purchases.cancel(similar.id, 'void', accountant, null, { client });
      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.cancelled_at);
      const stillThere = await client.query('SELECT id FROM purchase_invoices WHERE id = $1', [similar.id]);
      assert.equal(stillThere.rows.length, 1, 'cancel must keep the row');

      let reapprove = false;
      try {
        await purchases.approve(similar.id, accountant, null, { client });
      } catch (err) {
        reapprove = err.code === 'INVOICE_LOCKED';
      }
      assert.ok(reapprove, 'cancelled invoices cannot be approved');

      const audits = await client.query(
        `SELECT action FROM audit_logs
         WHERE module = 'purchases' AND entity_id = $1
         ORDER BY created_at`,
        [created.id]
      );
      const actions = audits.rows.map((row) => row.action);
      assert.ok(actions.includes('create_purchase_invoice'));
      assert.ok(actions.includes('update_purchase_invoice'));
      assert.ok(actions.includes('approve_purchase_invoice'));

      await client.query('ROLLBACK');
      rolledBack = true;
      console.log('  ok  quick supplier, draft CRUD, halalas, duplicate number, roles, cancel keeps row, ROLLBACK');
    } catch (err) {
      if (!rolledBack) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      }
      throw err;
    } finally {
      client.release();
    }

    const owned = await getClient();
    const originalGetClient = db.getClient;
    const originalAudit = purchasesAudit.logPurchaseAudit;
    try {
      await setSearchPath(owned, schema);
      db.getClient = async () => wrapClient(owned);

      const seedSupplier = await suppliers.createQuick({
        name: 'Audit Co',
        tax_number: '300000000007771',
        confirm: true,
      }, userId);

      purchasesAudit.logPurchaseAudit = async () => {
        throw new Error('audit failed');
      };
      await assert.rejects(
        () => purchases.create(draftBody(seedSupplier.id, 'AUD'), purchaser),
        /audit failed/
      );
      const left = await owned.query(
        'SELECT COUNT(*)::int AS n FROM purchase_invoices WHERE supplier_invoice_number = $1',
        ['PINV-AUD']
      );
      assert.equal(left.rows[0].n, 0, 'audit failure must ROLLBACK create');

      purchasesAudit.logPurchaseAudit = originalAudit;
      const seed = await purchases.create(draftBody(seedSupplier.id, 'AUD2'), purchaser);
      purchasesAudit.logPurchaseAudit = async () => {
        throw new Error('audit failed');
      };
      await assert.rejects(
        () => purchases.approve(seed.id, accountant),
        /audit failed/
      );
      const afterApprove = await owned.query('SELECT status FROM purchase_invoices WHERE id = $1', [seed.id]);
      assert.equal(afterApprove.rows[0].status, 'draft', 'audit failure must ROLLBACK approve');

      await owned.query('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1', [seed.id]);
      await owned.query('DELETE FROM purchase_invoices WHERE id = $1', [seed.id]);
      await owned.query('DELETE FROM suppliers WHERE id = $1', [seedSupplier.id]);
      await owned.query('DELETE FROM audit_logs WHERE module = $1 AND entity_id = ANY($2::text[])', [
        'purchases',
        [seed.id, seedSupplier.id],
      ]);
      await owned.query('DELETE FROM audit_logs WHERE module = $1 AND entity_id = $2', ['suppliers', seedSupplier.id]);
      console.log('  ok  audit failure rolls back create and approve');
    } finally {
      purchasesAudit.logPurchaseAudit = originalAudit;
      db.getClient = originalGetClient;
      owned.release();
    }

    const poolGetClient = db.getClient;
    db.getClient = async () => {
      const next = await poolGetClient();
      await setSearchPath(next, schema);
      return next;
    };
    try {
      const supplier = await suppliers.createQuick({
        name: 'Race Co',
        tax_number: '300000000006661',
        confirm: true,
      }, userId);
      const first = await purchases.create(draftBody(supplier.id, 'RACE'), purchaser);
      const second = await purchases.create(draftBody(supplier.id, 'RACE'), purchaser);
      const third = await purchases.create(draftBody(supplier.id, 'DBL'), purchaser);

      const sameRow = await Promise.allSettled([
        purchases.approve(third.id, accountant),
        purchases.approve(third.id, accountant),
      ]);
      const sameOk = sameRow.filter((item) => item.status === 'fulfilled');
      assert.ok(sameOk.length >= 1, 'double approve of one draft must not crash');
      sameOk.forEach((item) => assert.equal(item.value.status, 'approved'));

      const connA = await poolGetClient();
      const connB = await poolGetClient();
      try {
        const pidA = (await connA.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pidB = (await connB.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        assert.notEqual(pidA, pidB, 'local Postgres must allow two backends');
      } finally {
        connA.release();
        connB.release();
      }

      const raced = await Promise.allSettled([
        purchases.approve(first.id, accountant),
        purchases.approve(second.id, accountant),
      ]);
      const raceOk = raced.filter((item) => item.status === 'fulfilled');
      const raceFail = raced.filter((item) => item.status === 'rejected');
      assert.equal(raceOk.length, 1, 'exactly one concurrent approve of the same supplier invoice may succeed');
      assert.equal(raceFail.length, 1, 'exactly one concurrent approve must fail');
      assert.equal(raceFail[0].reason.code, 'DUPLICATE_SUPPLIER_INVOICE');

      const cleaner = await poolGetClient();
      try {
        await setSearchPath(cleaner, schema);
        await cleaner.query('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ANY($1::uuid[])', [
          [first.id, second.id, third.id],
        ]);
        await cleaner.query('DELETE FROM purchase_invoices WHERE id = ANY($1::uuid[])', [[first.id, second.id, third.id]]);
        await cleaner.query('DELETE FROM suppliers WHERE id = $1', [supplier.id]);
        await cleaner.query(
          `DELETE FROM audit_logs WHERE module IN ('purchases', 'suppliers') AND entity_id = ANY($1::text[])`,
          [[first.id, second.id, third.id, supplier.id]]
        );
      } finally {
        cleaner.release();
      }
      console.log('  ok  concurrent/double approve and duplicate supplier invoice number');
    } finally {
      db.getClient = poolGetClient;
    }

    const { serveUploads } = require('../config/storage');
    const attOwner = await getClient();
    try {
      await setSearchPath(attOwner, schema);
      db.getClient = async () => wrapClient(attOwner);
      const supplier = await suppliers.createQuick({
        name: 'File Co',
        tax_number: '300000000005551',
        confirm: true,
      }, userId);
      const draft = await purchases.create(draftBody(supplier.id, 'FILE'), purchaser);
      const attached = await purchases.addAttachment(draft.id, {
        buffer: Buffer.from('%PDF-1.4\nattachment'),
        originalname: 'invoice.pdf',
      }, purchaser);
      assert.ok(attached.download_path.includes(`/purchases/${draft.id}/attachments/`));
      assert.equal(attached.file_url, undefined);

      const opened = await purchases.openAttachment(draft.id, attached.id, purchaser);
      assert.ok(opened.stream);
      opened.stream.destroy();

      let hidden = false;
      try {
        await purchases.openAttachment(draft.id, attached.id, otherPurchaser);
      } catch (err) {
        hidden = err.code === 'NOT_FOUND';
      }
      assert.ok(hidden, 'purchaser must not download another user draft attachment');

      const allowed = await purchases.openAttachment(draft.id, attached.id, accountant);
      allowed.stream.destroy();

      const fakeReq = { path: `/purchases/${path.basename(attached.download_path)}.pdf`, headers: {}, query: {} };
      const fakeRes = {
        code: 0,
        status(code) { this.code = code; return this; },
        json() { return this; },
      };
      await serveUploads(fakeReq, fakeRes, () => {});
      assert.equal(fakeRes.code, 403);

      await purchases.softDelete(draft.id, purchaser);
      await attOwner.query('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1', [draft.id]);
      await attOwner.query('DELETE FROM purchase_invoices WHERE id = $1', [draft.id]);
      await attOwner.query('DELETE FROM suppliers WHERE id = $1', [supplier.id]);
      await attOwner.query(
        `DELETE FROM audit_logs WHERE module IN ('purchases', 'suppliers') AND entity_id = ANY($1::text[])`,
        [[draft.id, supplier.id]]
      );
      console.log('  ok  attachment download permissions and static path denial');
    } finally {
      db.getClient = poolGetClient;
      attOwner.release();
    }

    const bcrypt = require('bcryptjs');
    const auth = require('../services/auth.service');
    const disableOwner = await getClient();
    const username = `purch_sec_${Date.now()}`;
    const password = 'VerifyPurch1!';
    let tempUserId;
    try {
      await setSearchPath(disableOwner, schema);
      db.getClient = async () => wrapClient(disableOwner);
      const role = await disableOwner.query('SELECT id FROM roles LIMIT 1');
      const hash = await bcrypt.hash(password, 10);
      const { randomUUID } = require('crypto');
      tempUserId = randomUUID();
      await disableOwner.query(
        `INSERT INTO users (id, username, email, password_hash, full_name, full_name_ar, role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [tempUserId, username, `${username}@local.test`, hash, 'Purchaser Test', 'مندوب اختبار', role.rows[0].id]
      );
      const tempActor = {
        id: tempUserId,
        role_name: 'purchaser',
        permissions: ['purchases.view', 'purchases.create', 'suppliers.view'],
      };
      const supplier = await suppliers.createQuick({
        name: 'Disable Co',
        tax_number: '300000000004441',
        confirm: true,
      }, tempUserId);
      const draft = await purchases.create(draftBody(supplier.id, 'DIS'), tempActor);
      await disableOwner.query('UPDATE users SET is_active = false WHERE id = $1', [tempUserId]);
      let loginBlocked = false;
      try {
        await auth.login(username, password);
      } catch (err) {
        loginBlocked = err.code === 'INVALID_CREDENTIALS';
      }
      assert.ok(loginBlocked, 'disabled purchaser must not log in');
      const kept = await purchases.getById(draft.id, accountant, { client: disableOwner });
      assert.equal(kept.id, draft.id);
      assert.equal(kept.created_by, tempUserId);
      await disableOwner.query('DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1', [draft.id]);
      await disableOwner.query('DELETE FROM purchase_invoices WHERE id = $1', [draft.id]);
      await disableOwner.query('DELETE FROM suppliers WHERE id = $1', [supplier.id]);
      await disableOwner.query(
        `DELETE FROM audit_logs WHERE module IN ('purchases', 'suppliers') AND entity_id = ANY($1::text[])`,
        [[draft.id, supplier.id]]
      );
      await disableOwner.query('DELETE FROM refresh_tokens WHERE user_id = $1', [tempUserId]);
      await disableOwner.query('DELETE FROM users WHERE id = $1', [tempUserId]);
      tempUserId = null;
      console.log('  ok  disabling purchaser blocks login and keeps prior drafts');
    } finally {
      db.getClient = poolGetClient;
      if (tempUserId) {
        try {
          await disableOwner.query('DELETE FROM refresh_tokens WHERE user_id = $1', [tempUserId]);
          await disableOwner.query('DELETE FROM users WHERE id = $1', [tempUserId]);
        } catch (_) { /* cleanup best-effort */ }
      }
      disableOwner.release();
    }

    const permClient = await getClient();
    let permRolledBack = false;
    try {
      await permClient.query('BEGIN');
      const beforeAdmin = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name = 'admin'`
      );
      await applyCatalog(permClient, purchasesSql);
      const firstCatalog = await permClient.query(
        `SELECT COUNT(*)::int AS n FROM permissions
         WHERE code IN ('purchases.view', 'purchases.create', 'purchases.approve', 'purchases.cancel')`
      );
      assert.equal(firstCatalog.rows[0].n, 4);
      const purchaserRole = await permClient.query(`SELECT id, name_ar FROM roles WHERE name = 'purchaser'`);
      assert.equal(purchaserRole.rows.length, 1, 'migration must add purchaser idempotently');
      const purchaserPerms = await permClient.query(
        `SELECT p.code
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name = 'purchaser'
         ORDER BY p.code`
      );
      const purchaserCodes = purchaserPerms.rows.map((row) => row.code);
      assert.deepEqual(purchaserCodes, ['purchases.create', 'purchases.view', 'suppliers.view']);
      assert.ok(!purchaserCodes.includes('purchases.approve'));
      assert.ok(!purchaserCodes.includes('purchases.cancel'));
      assert.ok(!purchaserCodes.includes('suppliers.manage'));
      const accountantHasApprove = await permClient.query(
        `SELECT 1
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name = 'accountant' AND p.code = 'purchases.approve'`
      );
      assert.ok(accountantHasApprove.rows[0], 'accountant must receive approve');

      await applyCatalog(permClient, purchasesSql);
      const secondCatalog = await permClient.query(
        `SELECT COUNT(*)::int AS n FROM permissions
         WHERE code IN ('purchases.view', 'purchases.create', 'purchases.approve', 'purchases.cancel')`
      );
      assert.equal(secondCatalog.rows[0].n, firstCatalog.rows[0].n, 're-apply must not duplicate catalog');
      const afterAdmin = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name = 'admin'`
      );
      assert.ok(afterAdmin.rows[0].n >= beforeAdmin.rows[0].n);

      await permClient.query('ROLLBACK');
      permRolledBack = true;
      console.log('  ok  permission catalog re-apply is additive and idempotent, ROLLBACK');
    } catch (err) {
      if (!permRolledBack) {
        try { await permClient.query('ROLLBACK'); } catch (_) { /* ignore */ }
      }
      throw err;
    } finally {
      permClient.release();
    }
  } finally {
    const cleanup = await getClient();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      cleanup.release();
      resetSuppliersSchemaCache();
      resetPurchasesSchemaCache();
      await pool.end();
    }
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('\n=== Purchases integration: RAN and passed (transactions rolled back) ===\n');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { run, refuseIfNotLocalTestDb };
