/**
 * Verify permissions catalog + role assignments match permissions.js
 * Usage: node src/scripts/verify-permissions.js [--fix] [--reset]
 *
 * --fix    sync catalog + ensure default role permissions (keeps admin extras)
 * --reset  with --fix: replace each role with ROLE_PERMISSIONS from code (destructive)
 */
require('dotenv').config();
const { pool } = require('../config/database');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');
const { syncPermissionsCatalog, syncRolePermissions } = require('../utils/sync-permissions');

const fix = process.argv.includes('--fix');
const reset = process.argv.includes('--reset');

async function main() {
  const client = await pool.connect();
  const errors = [];

  try {
    if (fix) {
      console.log(reset ? 'Resetting role permissions from code...' : 'Syncing permissions (keeping admin customizations)...');
      await syncPermissionsCatalog(client);
      await syncRolePermissions(client, { reset });
      console.log('Sync complete.\n');
    }

    const catalog = await client.query('SELECT code FROM permissions ORDER BY code');
    const catalogCodes = new Set(catalog.rows.map((r) => r.code));
    const definedCodes = new Set(Object.values(PERMISSIONS));

    for (const code of definedCodes) {
      if (!catalogCodes.has(code)) {
        errors.push(`Missing in DB catalog: ${code}`);
      }
    }

    for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const code of codes) {
        if (!definedCodes.has(code)) {
          errors.push(`ROLE_PERMISSIONS[${role}] references unknown code: ${code}`);
        }
      }

      const roleRow = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
      if (!roleRow.rows[0]) {
        errors.push(`Role not in DB: ${role}`);
        continue;
      }

      const dbPerms = await client.query(
        `SELECT p.code FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = $1`,
        [roleRow.rows[0].id]
      );
      const dbSet = new Set(dbPerms.rows.map((r) => r.code));

      for (const code of codes) {
        if (!dbSet.has(code)) {
          errors.push(`DB role "${role}" missing default permission: ${code}`);
        }
      }
    }

    console.log('Permissions catalog:', catalogCodes.size, 'codes');
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      const roleRow = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
      if (!roleRow.rows[0]) continue;
      const dbPerms = await client.query(
        `SELECT p.code FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = $1 ORDER BY p.code`,
        [roleRow.rows[0].id]
      );
      console.log(`  ${role}: ${dbPerms.rows.length} permission(s)`);
    }

    if (errors.length) {
      console.error('\nFAILED:');
      errors.forEach((e) => console.error(' -', e));
      process.exit(1);
    }
    console.log('\nOK — permissions catalog and default role assignments are in sync.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
