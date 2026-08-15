/**
 * Suppliers phase-1 static and transactional-client checks. No database writes.
 * Usage: node src/scripts/verify-suppliers.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { supplierSchema } = require('../validators/schemas');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
const { refuseIfNotLocalTestDb } = require('./verify-suppliers-integration');

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

console.log('\n=== Suppliers validation ===\n');

check('supplierSchema requires bilingual names and forbids number/balance/iban', () => {
  const bad = supplierSchema.validate({ name: 'Acme' });
  assert.ok(bad.error);
  const numbered = supplierSchema.validate({
    name: 'Acme Labs',
    name_ar: 'مختبر أكمي',
    supplier_number: 'SUP-1',
  });
  assert.ok(numbered.error);
  const balanced = supplierSchema.validate({
    name: 'Acme Labs',
    name_ar: 'مختبر أكمي',
    balance: 10,
  });
  assert.ok(balanced.error);
  const withIban = supplierSchema.validate({
    name: 'Acme Labs',
    name_ar: 'مختبر أكمي',
    iban: 'SA0380000000608010167519',
  });
  assert.ok(withIban.error);
  const ok = supplierSchema.validate({
    name: 'Acme Labs',
    name_ar: 'مختبر أكمي',
    tax_number: '300000000000003',
  });
  assert.ok(!ok.error);
});

check('empty tax is allowed and IBAN is not a field', () => {
  const ok = supplierSchema.validate({
    name: 'Acme Labs',
    name_ar: 'مختبر أكمي',
    tax_number: '',
  });
  assert.ok(!ok.error);
  assert.equal(ok.value.iban, undefined);
});

console.log('\n=== Permissions ===\n');

check('suppliers.view and suppliers.manage exist', () => {
  assert.equal(PERMISSIONS.SUPPLIERS_VIEW, 'suppliers.view');
  assert.equal(PERMISSIONS.SUPPLIERS_MANAGE, 'suppliers.manage');
});

check('admin/manager/accountant receive supplier permissions', () => {
  assert.ok(ROLE_PERMISSIONS.admin.includes(PERMISSIONS.SUPPLIERS_VIEW));
  assert.ok(ROLE_PERMISSIONS.admin.includes(PERMISSIONS.SUPPLIERS_MANAGE));
  assert.ok(ROLE_PERMISSIONS.manager.includes(PERMISSIONS.SUPPLIERS_VIEW));
  assert.ok(ROLE_PERMISSIONS.manager.includes(PERMISSIONS.SUPPLIERS_MANAGE));
  assert.ok(ROLE_PERMISSIONS.accountant.includes(PERMISSIONS.SUPPLIERS_VIEW));
  assert.ok(ROLE_PERMISSIONS.accountant.includes(PERMISSIONS.SUPPLIERS_MANAGE));
});

check('reception and lab roles do not manage suppliers', () => {
  assert.ok(!ROLE_PERMISSIONS.reception.includes(PERMISSIONS.SUPPLIERS_MANAGE));
  assert.ok(!ROLE_PERMISSIONS.lab_technician.includes(PERMISSIONS.SUPPLIERS_VIEW));
});

console.log('\n=== Proposed SQL / audit / IBAN removal ===\n');

check('proposed SQL is idempotent, unique, and has no IBAN or inventory rewrite', () => {
  const sql = read('migrations/proposed-suppliers.sql');
  assert.ok(/CREATE TABLE IF NOT EXISTS suppliers/.test(sql));
  assert.ok(/supplier_number/.test(sql));
  assert.ok(/deleted_at/.test(sql));
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_number/.test(sql));
  assert.ok(/idx_suppliers_tax_number_active/.test(sql));
  assert.ok(!/\biban\b/i.test(sql));
  assert.ok(!/ALTER TABLE inventory_items/.test(sql));
  assert.ok(!/UPDATE inventory_items/.test(sql));
  assert.ok(!/^\s*balance\s/m.test(sql));
});

check('migrate.js does not apply proposed-suppliers.sql', () => {
  const migrate = read('src/scripts/migrate.js');
  assert.ok(!migrate.includes('proposed-suppliers.sql'));
});

check('service uses one transaction, row locks, 23505 mapping, and no IBAN', () => {
  const src = read('src/services/suppliers.service.js');
  assert.ok(/create_supplier/.test(src));
  assert.ok(/update_supplier/.test(src));
  assert.ok(/soft_delete_supplier/.test(src));
  assert.ok(/logSupplierAudit/.test(src));
  assert.ok(/BEGIN/.test(src));
  assert.ok(/COMMIT/.test(src));
  assert.ok(/ROLLBACK/.test(src));
  assert.ok(/SAVEPOINT supplier_insert/.test(src));
  assert.ok(/ROLLBACK TO SAVEPOINT/.test(src));
  assert.ok(/FOR UPDATE/.test(src));
  assert.ok(/23505/.test(src));
  assert.ok(/DUPLICATE_TAX_NUMBER/.test(src));
  assert.ok(/idx_suppliers_number/.test(src));
  assert.ok(/deleted_at = NOW\(\)/.test(src));
  assert.ok(!/DELETE FROM suppliers/.test(src));
  assert.ok(!/assertUniqueTax/.test(src));
  assert.ok(!/\biban\b/i.test(src));
  assert.ok(!/postInvoice|postPayment|adjustStock/.test(src));
  assert.ok(/if \(existing\.deleted_at\) return toPublic\(existing\)/.test(src));
  assert.ok(!/existing\.deleted_at \|\| !existing\.is_active/.test(src));
});

check('proposed SQL adds supplier permissions additively and idempotently', () => {
  const sql = read('migrations/proposed-suppliers.sql');
  assert.ok(/ON CONFLICT \(code\) DO UPDATE/.test(sql));
  assert.ok(/suppliers\.view/.test(sql));
  assert.ok(/suppliers\.manage/.test(sql));
  assert.ok(/INSERT INTO role_permissions[\s\S]+SELECT[\s\S]+ON CONFLICT DO NOTHING/.test(sql));
  assert.ok(/admin/.test(sql) && /manager/.test(sql) && /accountant/.test(sql));
  assert.ok(!/DELETE FROM permissions/.test(sql));
  assert.ok(!/DELETE FROM role_permissions/.test(sql));
});

check('audit helper requires a transaction client', () => {
  const src = read('src/utils/suppliers-audit.js');
  assert.ok(/AUDIT_CLIENT_REQUIRED/.test(src));
  assert.ok(!/const \{ query \}/.test(src));
});

check('routes require view/manage and never mention IBAN', () => {
  const src = read('src/routes/suppliers.routes.js');
  assert.ok(src.includes('PERMISSIONS.SUPPLIERS_VIEW'));
  assert.ok(src.includes('PERMISSIONS.SUPPLIERS_MANAGE'));
  assert.ok(src.includes("router.delete('/:id'"));
  assert.ok(!/iban/i.test(src));
  assert.ok(!/includeIban/.test(src));
  assert.ok(!/canSeeIban/.test(src));
});

check('IBAN helper files are removed', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/utils/supplier-iban.js')));
  assert.ok(!fs.existsSync(path.join(root, '../frontend/src/utils/supplierIban.js')));
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

check('inventory, ledger, and daily closing files are untouched', () => {
  const inventory = read('src/services/inventory.service.js');
  const ledger = read('src/services/ledger.service.js');
  const closing = read('src/services/daily-closing.service.js');
  assert.ok(!inventory.includes('suppliers'));
  assert.ok(!ledger.includes('suppliers'));
  assert.ok(!closing.includes('suppliers'));
});

const fakeRow = (overrides = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  supplier_number: 'SUP-260815-000001',
  name: 'Acme Labs',
  name_ar: 'مختبر أكمي',
  tax_number: '300000000000003',
  phone: null,
  email: null,
  address: null,
  notes: null,
  is_active: true,
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const makeTxClient = ({
  failAudit = false,
  insertErrors = [],
  existing = fakeRow(),
} = {}) => {
  const log = [];
  let insertAttempts = 0;
  return {
    log,
    released: false,
    query: async (sql) => {
      const text = String(sql);
      log.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/INSERT INTO audit_logs/i.test(text)) {
        if (failAudit) throw new Error('audit failed');
        return { rows: [] };
      }
      if (/INSERT INTO suppliers/i.test(text)) {
        const err = insertErrors[insertAttempts];
        insertAttempts += 1;
        if (err) throw err;
        return { rows: [existing] };
      }
      if (/FOR UPDATE/i.test(text)) {
        return { rows: existing ? [existing] : [] };
      }
      if (/UPDATE suppliers/i.test(text)) {
        return {
          rows: [{
            ...existing,
            phone: '0555555555',
            is_active: /is_active = false/.test(text) ? false : existing.is_active,
            deleted_at: /deleted_at = NOW\(\)/.test(text) ? new Date().toISOString() : existing.deleted_at,
          }],
        };
      }
      return { rows: [] };
    },
    release() { this.released = true; },
  };
};

const payload = {
  name: 'Acme Labs',
  name_ar: 'مختبر أكمي',
  tax_number: '300000000000003',
};

const runAsync = async () => {
  const db = require('../config/database');
  const suppliers = require('../services/suppliers.service');
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
      () => withMockClient(client, () => suppliers.create(payload, 'user-1')),
      /audit failed/
    );
    assert.ok(client.log.includes('BEGIN'));
    assert.ok(client.log.includes('ROLLBACK'));
    assert.ok(!client.log.includes('COMMIT'));
    assert.ok(client.released);
  });

  await checkAsync('update locks the row and rolls back when audit fails', async () => {
    const client = makeTxClient({ failAudit: true });
    await assert.rejects(
      () => withMockClient(client, () => suppliers.update(fakeRow().id, payload, 'user-1')),
      /audit failed/
    );
    assert.ok(client.log.some((sql) => /FOR UPDATE/i.test(sql)));
    assert.ok(client.log.includes('ROLLBACK'));
    assert.ok(!client.log.includes('COMMIT'));
  });

  await checkAsync('softDelete locks the row and rolls back when audit fails', async () => {
    const client = makeTxClient({ failAudit: true });
    await assert.rejects(
      () => withMockClient(client, () => suppliers.softDelete(fakeRow().id, 'user-1')),
      /audit failed/
    );
    assert.ok(client.log.some((sql) => /FOR UPDATE/i.test(sql)));
    assert.ok(client.log.includes('ROLLBACK'));
    assert.ok(!client.log.includes('COMMIT'));
  });

  await checkAsync('tax unique violation maps to DUPLICATE_TAX_NUMBER', async () => {
    const client = makeTxClient({
      insertErrors: [{ code: '23505', constraint: 'idx_suppliers_tax_number_active' }],
    });
    await assert.rejects(
      () => withMockClient(client, () => suppliers.create(payload, 'user-1')),
      (err) => err.code === 'DUPLICATE_TAX_NUMBER'
    );
    assert.ok(client.log.includes('ROLLBACK'));
    assert.ok(!client.log.includes('COMMIT'));
  });

  await checkAsync('supplier_number 23505 retries then succeeds', async () => {
    const client = makeTxClient({
      insertErrors: [{ code: '23505', constraint: 'idx_suppliers_number' }],
    });
    const created = await withMockClient(client, () => suppliers.create(payload, 'user-1'));
    assert.equal(created.supplier_number, 'SUP-260815-000001');
    assert.equal(client.log.filter((sql) => /INSERT INTO suppliers/i.test(sql)).length, 2);
    assert.ok(client.log.includes('COMMIT'));
    assert.ok(!client.log.includes('ROLLBACK'));
  });

  await checkAsync('update tax unique violation maps to DUPLICATE_TAX_NUMBER', async () => {
    const client = makeTxClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      if (/UPDATE suppliers SET/i.test(String(sql))) {
        client.log.push(String(sql));
        const err = new Error('duplicate');
        err.code = '23505';
        err.constraint = 'idx_suppliers_tax_number_active';
        throw err;
      }
      return originalQuery(sql, params);
    };
    await assert.rejects(
      () => withMockClient(client, () => suppliers.update(fakeRow().id, payload, 'user-1')),
      (err) => err.code === 'DUPLICATE_TAX_NUMBER'
    );
  });

  await checkAsync('softDelete still sets deleted_at when the supplier is already inactive', async () => {
    const existing = fakeRow({ is_active: false, deleted_at: null });
    const client = makeTxClient({ existing });
    const removed = await withMockClient(client, () => suppliers.softDelete(existing.id, 'user-1'));
    assert.ok(removed.deleted_at);
    assert.equal(removed.is_active, false);
    assert.ok(client.log.some((sql) => /deleted_at = NOW\(\)/.test(sql)));
    assert.ok(client.log.some((sql) => /INSERT INTO audit_logs/i.test(sql)));
    assert.ok(client.log.includes('COMMIT'));
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
