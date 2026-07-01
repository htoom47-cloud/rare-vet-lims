/**
 * Verify permissions catalog + role assignments match permissions.js
 * Usage: node src/scripts/verify-permissions.js [--fix]
 */
require('dotenv').config();
const { pool } = require('../config/database');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');

const fix = process.argv.includes('--fix');

async function syncPermissionsCatalog(client) {
  for (const [key, code] of Object.entries(PERMISSIONS)) {
    const module = code.split('.')[0];
    await client.query(
      `INSERT INTO permissions (code, module, description) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
      [code, module, key]
    );
  }
}

async function syncAllRolePermissions(client) {
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (!roleResult.rows[0]) continue;
    const roleId = roleResult.rows[0].id;

    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    for (const code of perms) {
      const perm = await client.query('SELECT id FROM permissions WHERE code = $1', [code]);
      if (perm.rows[0]) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, perm.rows[0].id]
        );
      }
    }
  }
}

async function main() {
  const client = await pool.connect();
  const errors = [];

  try {
    if (fix) {
      console.log('Syncing permissions catalog and role assignments...');
      await syncPermissionsCatalog(client);
      await syncAllRolePermissions(client);
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
          errors.push(`DB role "${role}" missing permission: ${code}`);
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
      const resultPerms = dbPerms.rows
        .map((r) => r.code)
        .filter((c) => c.startsWith('results.'));
      console.log(`  ${role}: ${resultPerms.join(', ') || '(none)'}`);
    }

    if (errors.length) {
      console.error('\nFAILED:');
      errors.forEach((e) => console.error(' -', e));
      process.exit(1);
    }
    console.log('\nOK — permissions catalog and role assignments are in sync.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
