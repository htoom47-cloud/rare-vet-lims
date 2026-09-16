/**
 * Purchase invoice drafts — static and mock-transaction checks. No database writes.
 * Usage: node src/scripts/verify-purchases.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  supplierQuickSchema,
  purchaseInvoiceSchema,
} = require('../validators/schemas');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
const { computeInvoiceTotals, assertTotalsMatch, toHalalas } = require('../utils/purchases-money');
const { sniffPurchaseFile } = require('../utils/purchases-files');
const { refuseIfNotLocalTestDb } = require('./verify-purchases-integration');

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

const checkAsync = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
};

console.log('\n=== Purchase invoice validation ===\n');

check('quick supplier requires confirm and does not auto-create', () => {
  const missing = supplierQuickSchema.validate({ name: 'Acme Labs' });
  assert.ok(missing.error);
  const denied = supplierQuickSchema.validate({ name: 'Acme Labs', confirm: false });
  assert.ok(denied.error);
  const ok = supplierQuickSchema.validate({ name: 'Acme Labs', confirm: true, phone: '0500000000' });
  assert.ok(!ok.error);
});

check('purchase invoice requires supplier unless cash unregistered', () => {
  const items = [{ description: 'Reagent', quantity: 1, unit_price_sar: 10 }];
  const missing = purchaseInvoiceSchema.validate({
    supplier_invoice_number: 'INV-1',
    invoice_date: '2026-08-15',
    items,
  });
  assert.ok(missing.error);
  const cash = purchaseInvoiceSchema.validate({
    uses_cash_unregistered: true,
    supplier_invoice_number: 'INV-1',
    invoice_date: '2026-08-15',
    items,
  });
  assert.ok(!cash.error);
});

check('halala totals: 10.00 + 15% VAT = 11.50 and identity holds', () => {
  const computed = computeInvoiceTotals(
    [{ description: 'A', quantity: 1, unit_price_sar: 10, tax_category: 'standard' }],
    0
  );
  assert.equal(computed.subtotal_halalas, 1000);
  assert.equal(computed.vat_halalas, 150);
  assert.equal(computed.total_halalas, 1150);
  assert.equal(computed.subtotal_halalas - computed.discount_halalas + computed.vat_halalas, computed.total_halalas);
  assert.equal(computed.tax_summary[0].tax_category, 'standard');
  assert.equal(computed.tax_summary[0].tax_rate, 15);
  assert.equal(toHalalas(10.005), 1001);
});

check('zero-VAT categories stay at 0% and cash defaults to out_of_scope', () => {
  const exempt = computeInvoiceTotals(
    [{ description: 'A', quantity: 1, unit_price_sar: 10, tax_category: 'exempt' }],
    0
  );
  assert.equal(exempt.vat_halalas, 0);
  assert.equal(exempt.total_halalas, 1000);
  assert.equal(exempt.items[0].tax_category, 'exempt');
  const cash = computeInvoiceTotals(
    [{ description: 'Petty', quantity: 1, unit_price_sar: 5 }],
    0,
    { defaultCategory: 'out_of_scope' }
  );
  assert.equal(cash.items[0].tax_category, 'out_of_scope');
  assert.equal(cash.vat_halalas, 0);
  assert.equal(cash.total_halalas, 500);
});

check('mixed rates, rounding, discount allocation, and rejected free rates', () => {
  const mixed = computeInvoiceTotals([
    { description: 'Std', quantity: 1, unit_price_sar: 10, tax_category: 'standard' },
    { description: 'Ex', quantity: 1, unit_price_sar: 10, tax_category: 'exempt' },
  ], 0);
  assert.equal(mixed.subtotal_halalas, 2000);
  assert.equal(mixed.vat_halalas, 150);
  assert.equal(mixed.total_halalas, 2150);
  assert.equal(mixed.tax_summary.length, 2);

  const rounded = computeInvoiceTotals(
    [{ description: 'R', quantity: 1, unit_price_sar: 10.01, tax_category: 'standard' }],
    0
  );
  assert.equal(rounded.subtotal_halalas, 1001);
  assert.equal(rounded.vat_halalas, 150);
  assert.equal(rounded.total_halalas, 1151);

  const computed = computeInvoiceTotals(
    [{ description: 'A', quantity: 2, unit_price_sar: 10, discount_sar: 1, tax_category: 'standard' }],
    300
  );
  assert.equal(computed.subtotal_halalas, 1900);
  assert.equal(computed.discount_halalas, 300);
  assert.equal(computed.vat_halalas, 240);
  assert.equal(computed.total_halalas, 1840);
  assert.equal(computed.subtotal_halalas - computed.discount_halalas + computed.vat_halalas, computed.total_halalas);

  assert.throws(
    () => computeInvoiceTotals([{ description: 'A', quantity: 1, unit_price_sar: 10, tax_rate: 5 }], 0),
    (err) => err.code === 'INVALID_TAX_RATE'
  );
  assert.throws(
    () => computeInvoiceTotals([{ description: 'A', quantity: 1, unit_price_sar: 10, tax_category: 'standard', tax_rate: 0 }], 0),
    (err) => err.code === 'INVALID_TAX_RATE'
  );
  assert.throws(
    () => computeInvoiceTotals([{ description: 'A', quantity: 1, unit_price_sar: 10, tax_category: 'exempt', tax_rate: 15 }], 0),
    (err) => err.code === 'INVALID_TAX_RATE'
  );
  assert.throws(
    () => computeInvoiceTotals([{ description: 'A', quantity: 0, unit_price_sar: 10 }], 0),
    (err) => err.code === 'INVALID_QUANTITY'
  );
});

check('submitted totals mismatch is rejected', () => {
  const computed = computeInvoiceTotals(
    [{ description: 'A', quantity: 2, unit_price_sar: 3.5, tax_category: 'standard' }],
    0
  );
  assert.throws(
    () => assertTotalsMatch(computed, { total_halalas: 1 }),
    (err) => err.code === 'TOTALS_MISMATCH'
  );
});

check('file sniff allows images/PDF and blocks executables', () => {
  const pdf = sniffPurchaseFile(Buffer.from('%PDF-1.4\n'), 'invoice.pdf');
  assert.equal(pdf.mime, 'application/pdf');
  const jpg = sniffPurchaseFile(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]), 'scan.jpg');
  assert.equal(jpg.mime, 'image/jpeg');
  assert.throws(
    () => sniffPurchaseFile(Buffer.from([0x4D, 0x5A]), 'payload.exe'),
    (err) => err.code === 'FILE_TYPE_BLOCKED'
  );
  assert.throws(
    () => sniffPurchaseFile(Buffer.from('MZ'), 'run.bat'),
    (err) => err.code === 'FILE_TYPE_BLOCKED'
  );
});

console.log('\n=== Permissions ===\n');

check('purchase permission codes exist', () => {
  assert.equal(PERMISSIONS.PURCHASES_VIEW, 'purchases.view');
  assert.equal(PERMISSIONS.PURCHASES_CREATE, 'purchases.create');
  assert.equal(PERMISSIONS.PURCHASES_APPROVE, 'purchases.approve');
  assert.equal(PERMISSIONS.PURCHASES_CANCEL, 'purchases.cancel');
});

check('purchaser can create but cannot approve or cancel', () => {
  const codes = ROLE_PERMISSIONS.purchaser;
  assert.ok(codes.includes(PERMISSIONS.PURCHASES_VIEW));
  assert.ok(codes.includes(PERMISSIONS.PURCHASES_CREATE));
  assert.ok(codes.includes(PERMISSIONS.SUPPLIERS_VIEW));
  assert.ok(!codes.includes(PERMISSIONS.PURCHASES_APPROVE));
  assert.ok(!codes.includes(PERMISSIONS.PURCHASES_CANCEL));
  assert.ok(!codes.includes(PERMISSIONS.PURCHASES_POST));
});

check('accountant and manager can review, approve, cancel, and post', () => {
  for (const role of ['accountant', 'manager', 'admin']) {
    const codes = ROLE_PERMISSIONS[role];
    assert.ok(codes.includes(PERMISSIONS.PURCHASES_VIEW));
    assert.ok(codes.includes(PERMISSIONS.PURCHASES_APPROVE));
    assert.ok(codes.includes(PERMISSIONS.PURCHASES_CANCEL));
    assert.ok(codes.includes(PERMISSIONS.PURCHASES_POST));
  }
});

check('reception and lab roles do not receive purchase permissions', () => {
  for (const role of ['reception', 'lab_technician', 'lab_specialist', 'veterinarian']) {
    const codes = ROLE_PERMISSIONS[role] || [];
    assert.ok(!codes.includes(PERMISSIONS.PURCHASES_VIEW));
    assert.ok(!codes.includes(PERMISSIONS.PURCHASES_APPROVE));
    assert.ok(!codes.includes(PERMISSIONS.PURCHASES_POST));
  }
});

console.log('\n=== Proposed SQL / scope ===\n');

check('proposed SQL is idempotent, unique on approved invoice number, and has hook columns', () => {
  const sql = read('migrations/proposed-purchase-invoices.sql');
  assert.ok(/CREATE TABLE IF NOT EXISTS purchase_invoices/.test(sql));
  assert.ok(/idx_purchase_invoices_supplier_number_approved/.test(sql));
  assert.ok(/status = 'approved'/.test(sql));
  assert.ok(/stock_applied_at/.test(sql));
  assert.ok(/ledger_posted_at/.test(sql));
  assert.ok(/is_temporary/.test(sql));
  assert.ok(/SUP-CASH-UNREG/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS is_temporary/.test(sql));
  assert.ok(/ADD COLUMN IF NOT EXISTS is_system/.test(sql));
  assert.ok(/DROP CONSTRAINT IF EXISTS purchase_invoices_vat_15/.test(sql));
  assert.ok(/purchase_item_tax_pair/.test(sql));
  assert.ok(/tax_category IN \('standard', 'zero_rated', 'exempt', 'out_of_scope'\)/.test(sql));
  assert.ok(/INSERT INTO roles/.test(sql));
  assert.ok(/'purchaser'/.test(sql));
  assert.ok(/WHERE r\.name = 'purchaser'\s+AND p\.code IN \('purchases\.view', 'purchases\.create', 'suppliers\.view'\)/.test(sql));
  assert.ok(!/r\.name = 'purchaser'[\s\S]{0,80}purchases\.approve/.test(sql));
  assert.ok(!/suppliers\.manage/.test(sql));
  assert.ok(/ON CONFLICT \(code\) DO UPDATE/.test(sql));
  assert.ok(/ON CONFLICT DO NOTHING/.test(sql));
  assert.ok(!/DELETE FROM permissions/.test(sql));
  assert.ok(!/UPDATE suppliers SET[\s\S]*is_temporary = true/.test(sql));
  assert.ok(!/adjustStock|postInvoice|ledger_entries/.test(sql));
});

check('migrate.js does not apply proposed purchase or supplier SQL', () => {
  const migrate = read('src/scripts/migrate.js');
  assert.ok(!migrate.includes('proposed-purchase-invoices.sql'));
  assert.ok(!migrate.includes('proposed-suppliers.sql'));
});

check('service uses one transaction, locks, 23505 mapping, and no stock/ledger posting', () => {
  const src = read('src/services/purchases.service.js');
  assert.ok(/BEGIN/.test(src));
  assert.ok(/COMMIT/.test(src));
  assert.ok(/ROLLBACK/.test(src));
  assert.ok(/FOR UPDATE/.test(src));
  assert.ok(/SAVEPOINT purchase_approve/.test(src));
  assert.ok(/DUPLICATE_SUPPLIER_INVOICE/.test(src));
  assert.ok(/INVOICE_LOCKED/.test(src));
  assert.ok(/logPurchaseAudit/.test(src));
  assert.ok(/SIMILAR_INVOICE/.test(src));
  assert.ok(/stock_applied_at/.test(src));
  assert.ok(!/adjustStock|postInvoice|postPayment/.test(src));
  assert.ok(!/DELETE FROM purchase_invoices/.test(src));
});

check('audit helper requires a transaction client', () => {
  const src = read('src/utils/purchases-audit.js');
  assert.ok(/AUDIT_CLIENT_REQUIRED/.test(src));
  assert.ok(!/const \{ query \}/.test(src));
});

check('uploads deny static purchases paths and require the download API', () => {
  const storage = read('src/config/storage.js');
  assert.ok(storage.includes("'purchases/'") || storage.includes('"purchases/"'));
  assert.ok(storage.includes('PURCHASE_FILE_FORBIDDEN'));
  const routes = read('src/routes/purchases.routes.js');
  assert.ok(routes.includes("router.get('/:id/attachments/:attachmentId'"));
  const service = read('src/services/purchases.service.js');
  assert.ok(service.includes('openAttachment'));
  assert.ok(!/file_url: row\.file_url/.test(service));
  const suppliers = read('src/services/suppliers.service.js');
  assert.ok(!/42703/.test(suppliers));
  assert.ok(suppliers.includes('includePurchaseColumns'));
  assert.ok(suppliers.includes('PURCHASES_MIGRATION_REQUIRED'));
});

check('inactive users are rejected at login without cascade-deleting purchases', () => {
  const authService = read('src/services/auth.service.js');
  const authMw = read('src/middleware/auth.js');
  const sql = read('migrations/proposed-purchase-invoices.sql');
  assert.ok(/!user \|\| !user\.is_active/.test(authService));
  assert.ok(/!result\.rows\[0\] \|\| !result\.rows\[0\]\.is_active/.test(authMw));
  assert.ok(/created_by UUID REFERENCES users\(id\)/.test(sql));
  assert.ok(!/created_by UUID REFERENCES users\(id\) ON DELETE CASCADE/.test(sql));
});

check('users screen assigns existing roles and cannot create a new role', () => {
  const usersPage = read('../frontend/src/pages/Users.jsx');
  assert.ok(/usersAPI\.roles\(\)/.test(usersPage));
  assert.ok(/roles\.map/.test(usersPage));
  assert.ok(!/createRole|POST.*\/roles|newRole/.test(usersPage));
});

check('inventory, ledger, and daily closing files are untouched', () => {
  const inventory = read('src/services/inventory.service.js');
  const ledger = read('src/services/ledger.service.js');
  const closing = read('src/services/daily-closing.service.js');
  assert.ok(!inventory.includes('purchase_invoice'));
  assert.ok(!ledger.includes('purchase_invoice'));
  assert.ok(!closing.includes('purchase_invoice'));
});

check('integration helper refuses hosted databases', () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevTest = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://u:p@dpg-example.render.com/lims';
  process.env.TEST_DATABASE_URL = '';
  assert.throws(() => refuseIfNotLocalTestDb(), /REFUSED/);
  process.env.DATABASE_URL = prevUrl;
  process.env.TEST_DATABASE_URL = prevTest;
});

const fakeInvoice = (overrides = {}) => ({
  id: '22222222-2222-2222-2222-222222222222',
  document_number: 'PIN-260815-000001',
  supplier_id: '11111111-1111-1111-1111-111111111111',
  supplier_invoice_number: 'SUP-INV-1',
  invoice_date: '2026-08-15',
  status: 'draft',
  payment_method: 'cash',
  notes: null,
  vat_rate_bps: 1500,
  subtotal_halalas: 1000,
  discount_halalas: 0,
  vat_halalas: 150,
  total_halalas: 1150,
  uses_cash_unregistered: false,
  created_by: 'user-1',
  approved_by: null,
  cancelled_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  approved_at: null,
  cancelled_at: null,
  cancel_reason: null,
  deleted_at: null,
  stock_applied_at: null,
  ledger_posted_at: null,
  ...overrides,
});

const fakeSupplier = {
  id: '11111111-1111-1111-1111-111111111111',
  supplier_number: 'SUP-260815-000001',
  is_active: true,
  tax_number: '300000000000003',
  deleted_at: null,
};

const makeTxClient = ({
  failAudit = false,
  insertErrors = [],
  approveErrors = [],
  existing = fakeInvoice(),
  supplier = fakeSupplier,
} = {}) => {
  const log = [];
  let insertAttempts = 0;
  let approveAttempts = 0;
  return {
    log,
    released: false,
    query: async (sql) => {
      const text = String(sql);
      log.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT/.test(text)) return { rows: [] };
      if (/INSERT INTO audit_logs/i.test(text)) {
        if (failAudit) throw new Error('audit failed');
        return { rows: [] };
      }
      if (/FROM suppliers/i.test(text)) return { rows: [supplier] };
      if (/INSERT INTO purchase_invoices/i.test(text)) {
        const err = insertErrors[insertAttempts];
        insertAttempts += 1;
        if (err) throw err;
        return { rows: [existing] };
      }
      if (/FOR UPDATE/i.test(text)) {
        return { rows: existing ? [existing] : [] };
      }
      if (/UPDATE purchase_invoices SET\s+status = 'approved'/i.test(text)
        || (/status = 'approved'/.test(text) && /UPDATE purchase_invoices/i.test(text))) {
        const err = approveErrors[approveAttempts];
        approveAttempts += 1;
        if (err) throw err;
        return { rows: [{ ...existing, status: 'approved' }] };
      }
      if (/UPDATE purchase_invoices/i.test(text)) {
        return { rows: [{ ...existing, status: /cancelled/.test(text) ? 'cancelled' : existing.status }] };
      }
      if (/DELETE FROM purchase_invoice_items/i.test(text)) return { rows: [] };
      if (/INSERT INTO purchase_invoice_items/i.test(text)) return { rows: [] };
      if (/FROM purchase_invoices/i.test(text) && /SIMILAR|total_halalas/.test(text)) return { rows: [] };
      return { rows: [] };
    },
    release() { this.released = true; },
  };
};

const draftPayload = {
  supplier_id: fakeSupplier.id,
  supplier_invoice_number: 'SUP-INV-1',
  invoice_date: '2026-08-15',
  payment_method: 'cash',
  items: [{ description: 'Reagent', quantity: 1, unit_price_sar: 10 }],
};

const runAsync = async () => {
  const db = require('../config/database');
  const purchasesSchema = require('../utils/purchases-schema');
  purchasesSchema.assertPurchasesReady = async () => ({ purchasesReady: true });
  const purchases = require('../services/purchases.service');
  const originalGetClient = db.getClient;

  const withMockClient = async (client, work) => {
    db.getClient = async () => client;
    try {
      return await work();
    } finally {
      db.getClient = originalGetClient;
    }
  };

  console.log('\n=== Transaction rollback and 23505 mapping ===\n');

  await checkAsync('create rolls back when audit fails', async () => {
    const client = makeTxClient({ failAudit: true });
    await assert.rejects(
      () => withMockClient(client, () => purchases.create(draftPayload, 'user-1')),
      /audit failed/
    );
    assert.ok(client.log.includes('BEGIN'));
    assert.ok(client.log.includes('ROLLBACK'));
    assert.ok(!client.log.includes('COMMIT'));
    assert.ok(client.released);
  });

  await checkAsync('approve unique violation maps to DUPLICATE_SUPPLIER_INVOICE', async () => {
    const client = makeTxClient({
      approveErrors: [{ code: '23505', constraint: 'idx_purchase_invoices_supplier_number_approved' }],
    });
    await assert.rejects(
      () => withMockClient(client, () => purchases.approve(fakeInvoice().id, 'user-1')),
      (err) => err.code === 'DUPLICATE_SUPPLIER_INVOICE'
    );
    assert.ok(client.log.some((sql) => /FOR UPDATE/i.test(sql)));
    assert.ok(client.log.includes('ROLLBACK'));
  });

  await checkAsync('approved invoice cannot be updated', async () => {
    const client = makeTxClient({ existing: fakeInvoice({ status: 'approved' }) });
    await assert.rejects(
      () => withMockClient(client, () => purchases.update(fakeInvoice().id, draftPayload, 'user-1')),
      (err) => err.code === 'INVOICE_LOCKED'
    );
  });

  await checkAsync('approved invoice cannot be soft-deleted', async () => {
    const client = makeTxClient({ existing: fakeInvoice({ status: 'approved' }) });
    await assert.rejects(
      () => withMockClient(client, () => purchases.softDelete(fakeInvoice().id, 'user-1')),
      (err) => err.code === 'INVOICE_LOCKED'
    );
  });

  await checkAsync('purchaser actor is forbidden from approve', async () => {
    const client = makeTxClient();
    await assert.rejects(
      () => withMockClient(client, () => purchases.approve(fakeInvoice().id, {
        id: 'user-1',
        role_name: 'purchaser',
        permissions: ['purchases.view', 'purchases.create'],
      })),
      (err) => err.code === 'FORBIDDEN'
    );
    assert.ok(!client.log.includes('BEGIN'));
  });
};

runAsync()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
