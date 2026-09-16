/**
 * Local PostgreSQL integration for suppliers CRUD.
 * Uses an isolated schema. Every data transaction ends with ROLLBACK.
 * Refuses hosted/production hosts. Does not leave public supplier rows.
 *
 * Usage: node src/scripts/verify-suppliers-integration.js
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

const payload = (suffix) => {
  const digits = String(suffix).replace(/\D/g, '') || '0';
  return {
    name: `Acme Labs ${suffix}`,
    name_ar: `مختبر أكمي ${suffix}`,
    tax_number: `3${digits.padStart(14, '0')}`.slice(0, 15),
    phone: '0500000000',
    email: `acme${suffix}@example.com`,
    address: 'Riyadh',
    notes: 'integration',
  };
};

const setSearchPath = (client, schema) => client.query(`SET search_path TO ${schema}, public`);

const wrapClient = (client) => ({
  query: (...args) => client.query(...args),
  release() {},
});

const run = async () => {
  refuseIfNotLocalTestDb();
  resetSuppliersSchemaCache();

  const db = require('../config/database');
  const { getClient, pool } = db;
  const suppliers = require('../services/suppliers.service');
  const suppliersAudit = require('../utils/suppliers-audit');

  const proposedSql = fs.readFileSync(
    path.join(__dirname, '../../migrations/proposed-suppliers.sql'),
    'utf8'
  );

  const schema = `suppliers_sec_${Date.now()}`;
  const setup = await getClient();
  try {
    await setup.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'suppliers_sec_%'
        LOOP
          EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.nspname);
        END LOOP;
      END $$;
    `);
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setSearchPath(setup, schema);
    for (const statement of splitSqlStatements(proposedSql)) {
      if (/INSERT INTO permissions|INSERT INTO role_permissions/i.test(statement)) continue;
      await setup.query(statement);
    }
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
    throw new Error('local DB has no users; cannot run suppliers integration');
  }

  try {
    const client = await getClient();
    let rolledBack = false;
    try {
      await setSearchPath(client, schema);
      await client.query('BEGIN');

      const created = await suppliers.create(payload('1'), userId, null, { client });
      assert.ok(created.supplier_number.startsWith('SUP-'));
      assert.equal(created.iban, undefined);
      assert.equal(created.balance, undefined);

      const listed = await suppliers.list({ search: created.supplier_number, page: 1, limit: 20 }, { client });
      assert.equal(listed.data.length, 1);
      assert.equal(listed.pagination.total, 1);
      assert.equal(listed.pagination.page, 1);
      assert.equal(listed.data[0].iban, undefined);

      let duplicateTaxFailed = false;
      try {
        await suppliers.create({ ...payload('2'), tax_number: created.tax_number }, userId, null, { client });
      } catch (err) {
        duplicateTaxFailed = err.code === 'DUPLICATE_TAX_NUMBER';
      }
      assert.ok(duplicateTaxFailed, 'duplicate tax number must be rejected via unique index');

      const updated = await suppliers.update(created.id, {
        ...payload('1'),
        phone: '0555555555',
        is_active: true,
      }, userId, null, { client });
      assert.equal(updated.phone, '0555555555');
      assert.equal(updated.supplier_number, created.supplier_number);

      const page = await suppliers.list({ page: 1, limit: 1 }, { client });
      assert.equal(page.data.length, 1);
      assert.ok(page.pagination.total >= 1);
      assert.equal(page.pagination.limit, 1);

      const removed = await suppliers.softDelete(created.id, userId, null, { client });
      assert.ok(removed.deleted_at);
      assert.equal(removed.is_active, false);

      let missing = false;
      try {
        await suppliers.getById(created.id, {}, { client });
      } catch (err) {
        missing = err.code === 'NOT_FOUND';
      }
      assert.ok(missing, 'soft-deleted supplier must not be returned');

      const afterDelete = await suppliers.list({ search: created.supplier_number }, { client });
      assert.equal(afterDelete.data.length, 0);

      const audits = await client.query(
        `SELECT action FROM audit_logs
         WHERE module = 'suppliers' AND entity_id = $1
         ORDER BY created_at`,
        [created.id]
      );
      const actions = audits.rows.map((row) => row.action);
      assert.ok(actions.includes('create_supplier'));
      assert.ok(actions.includes('update_supplier'));
      assert.ok(actions.includes('soft_delete_supplier'));

      const hard = await client.query('SELECT COUNT(*)::int AS n FROM suppliers WHERE id = $1', [created.id]);
      assert.equal(hard.rows[0].n, 1, 'row must remain after soft delete');

      const inactive = await suppliers.create(payload('3'), userId, null, { client });
      const deactivated = await suppliers.update(inactive.id, {
        ...payload('3'),
        is_active: false,
      }, userId, null, { client });
      assert.equal(deactivated.is_active, false);
      assert.ok(!deactivated.deleted_at);
      const removedInactive = await suppliers.softDelete(inactive.id, userId, null, { client });
      assert.ok(removedInactive.deleted_at, 'inactive supplier must still receive deleted_at');
      assert.equal(removedInactive.is_active, false);
      const inactiveAudits = await client.query(
        `SELECT action FROM audit_logs
         WHERE module = 'suppliers' AND entity_id = $1 AND action = 'soft_delete_supplier'`,
        [inactive.id]
      );
      assert.equal(inactiveAudits.rows.length, 1, 'softDelete after update must write audit');

      await client.query('ROLLBACK');
      rolledBack = true;
      console.log('  ok  create, duplicate tax, update, soft delete, inactive-then-delete, audit, pagination, ROLLBACK');
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
    const originalAudit = suppliersAudit.logSupplierAudit;
    try {
      await setSearchPath(owned, schema);
      db.getClient = async () => wrapClient(owned);

      suppliersAudit.logSupplierAudit = async () => {
        throw new Error('audit failed');
      };
      await assert.rejects(
        () => suppliers.create(payload('91'), userId),
        /audit failed/
      );
      const createLeft = await owned.query(
        'SELECT COUNT(*)::int AS n FROM suppliers WHERE name = $1',
        [payload('91').name]
      );
      assert.equal(createLeft.rows[0].n, 0, 'audit failure must ROLLBACK create');

      suppliersAudit.logSupplierAudit = originalAudit;
      const seed = await suppliers.create(payload('92'), userId);

      suppliersAudit.logSupplierAudit = async () => {
        throw new Error('audit failed');
      };
      await assert.rejects(
        () => suppliers.update(seed.id, { ...payload('92'), phone: '0111111111' }, userId),
        /audit failed/
      );
      const afterUpdate = await owned.query('SELECT phone FROM suppliers WHERE id = $1', [seed.id]);
      assert.equal(afterUpdate.rows[0].phone, '0500000000', 'audit failure must ROLLBACK update');

      await assert.rejects(
        () => suppliers.softDelete(seed.id, userId),
        /audit failed/
      );
      const afterDelete = await owned.query(
        'SELECT is_active, deleted_at FROM suppliers WHERE id = $1',
        [seed.id]
      );
      assert.equal(afterDelete.rows[0].is_active, true);
      assert.equal(afterDelete.rows[0].deleted_at, null, 'audit failure must ROLLBACK softDelete');

      await owned.query('DELETE FROM suppliers WHERE id = $1', [seed.id]);
      await owned.query('DELETE FROM audit_logs WHERE module = $1 AND entity_id = $2', ['suppliers', seed.id]);
      console.log('  ok  audit failure rolls back create, update, and softDelete');
    } finally {
      suppliersAudit.logSupplierAudit = originalAudit;
      db.getClient = originalGetClient;
      owned.release();
    }

    const numberClients = await Promise.all(Array.from({ length: 8 }, () => getClient()));
    try {
      await Promise.all(numberClients.map((c) => setSearchPath(c, schema)));
      await Promise.all(numberClients.map((c) => c.query('BEGIN')));
      const created = await Promise.all(
        numberClients.map((c, index) => suppliers.create(payload(`${20 + index}`), userId, { client: c }))
      );
      const numbers = created.map((row) => row.supplier_number);
      assert.equal(new Set(numbers).size, numbers.length, 'concurrent creates must not share supplier_number');
      await Promise.all(numberClients.map((c) => c.query('ROLLBACK')));
      console.log('  ok  concurrent creates keep unique supplier_number then ROLLBACK');
    } catch (err) {
      await Promise.all(numberClients.map(async (c) => {
        try { await c.query('ROLLBACK'); } catch (_) { /* ignore */ }
      }));
      throw err;
    } finally {
      numberClients.forEach((c) => c.release());
    }

    const poolGetClient = db.getClient;
    db.getClient = async () => {
      const next = await poolGetClient();
      await setSearchPath(next, schema);
      return next;
    };
    try {
      const tax = '300000000009991';
      const results = await Promise.allSettled([
        suppliers.create({ ...payload('31'), tax_number: tax }, userId),
        suppliers.create({ ...payload('32'), tax_number: tax }, userId),
      ]);
      const ok = results.filter((item) => item.status === 'fulfilled');
      const failed = results.filter((item) => item.status === 'rejected');
      assert.equal(ok.length, 1, 'exactly one concurrent tax create may succeed');
      assert.equal(failed.length, 1, 'exactly one concurrent tax create must fail');
      assert.equal(failed[0].reason.code, 'DUPLICATE_TAX_NUMBER');
      if (ok[0]?.value?.id) {
        const cleaner = await poolGetClient();
        try {
          await setSearchPath(cleaner, schema);
          await cleaner.query('DELETE FROM suppliers WHERE id = $1', [ok[0].value.id]);
          await cleaner.query(
            'DELETE FROM audit_logs WHERE module = $1 AND entity_id = $2',
            ['suppliers', ok[0].value.id]
          );
        } finally {
          cleaner.release();
        }
      }
      console.log('  ok  concurrent duplicate tax_number maps to DUPLICATE_TAX_NUMBER');
    } finally {
      db.getClient = poolGetClient;
    }

    const applyPermissionSql = async (executor) => {
      for (const statement of splitSqlStatements(proposedSql)) {
        if (/INSERT INTO permissions|INSERT INTO role_permissions/i.test(statement)) {
          await executor.query(statement);
        }
      }
    };

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
      const beforeReception = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name = 'reception'`
      );

      await applyPermissionSql(permClient);
      const firstCatalog = await permClient.query(
        `SELECT COUNT(*)::int AS n FROM permissions WHERE code IN ('suppliers.view', 'suppliers.manage')`
      );
      const firstRoles = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name IN ('admin', 'manager', 'accountant')
           AND p.code IN ('suppliers.view', 'suppliers.manage')`
      );
      assert.equal(firstCatalog.rows[0].n, 2);
      assert.ok(firstRoles.rows[0].n >= 2, 'expected supplier permissions on at least one default role');

      const afterFirstAdmin = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name = 'admin'`
      );
      assert.ok(afterFirstAdmin.rows[0].n >= beforeAdmin.rows[0].n, 'admin assignments must not shrink');

      const reception = await permClient.query(`SELECT id FROM roles WHERE name = 'reception'`);
      const viewPerm = await permClient.query(`SELECT id FROM permissions WHERE code = 'suppliers.view'`);
      if (reception.rows[0] && viewPerm.rows[0]) {
        await permClient.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [reception.rows[0].id, viewPerm.rows[0].id]
        );
      }

      await applyPermissionSql(permClient);
      const secondCatalog = await permClient.query(
        `SELECT COUNT(*)::int AS n FROM permissions WHERE code IN ('suppliers.view', 'suppliers.manage')`
      );
      const secondRoles = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name IN ('admin', 'manager', 'accountant')
           AND p.code IN ('suppliers.view', 'suppliers.manage')`
      );
      const afterSecondAdmin = await permClient.query(
        `SELECT COUNT(*)::int AS n
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name = 'admin'`
      );
      assert.equal(secondCatalog.rows[0].n, firstCatalog.rows[0].n, 're-apply must not duplicate catalog rows');
      assert.equal(secondRoles.rows[0].n, firstRoles.rows[0].n, 're-apply must not duplicate role assignments');
      assert.equal(afterSecondAdmin.rows[0].n, afterFirstAdmin.rows[0].n);

      if (reception.rows[0] && viewPerm.rows[0]) {
        const stillHas = await permClient.query(
          `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
          [reception.rows[0].id, viewPerm.rows[0].id]
        );
        assert.ok(stillHas.rows[0], 're-apply must not remove extra role assignments');
        const afterReception = await permClient.query(
          `SELECT COUNT(*)::int AS n
           FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
           WHERE r.name = 'reception'`
        );
        assert.ok(afterReception.rows[0].n >= beforeReception.rows[0].n);
      }

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
      await pool.end();
    }
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('\n=== Suppliers integration: RAN and passed (transactions rolled back) ===\n');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { run, refuseIfNotLocalTestDb };
