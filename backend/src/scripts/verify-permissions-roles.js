/**
 * Verify role → permission matrix for results.* across ALL roles (no HTTP server).
 * Usage: node src/scripts/verify-permissions-roles.js
 */
require('dotenv').config();
const { pool } = require('../config/database');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');

const authorize = (userPerms, roleName, ...required) =>
  required.some((p) => userPerms.includes(p) || roleName === 'admin');

const expectedResultsAccess = (perms, role) => ({
  enter: authorize(perms, role, PERMISSIONS.RESULTS_ENTER, PERMISSIONS.RESULTS_EDIT),
  edit: authorize(perms, role, PERMISSIONS.RESULTS_EDIT),
  validate: authorize(perms, role, PERMISSIONS.RESULTS_VALIDATE),
  unvalidate: authorize(perms, role, PERMISSIONS.RESULTS_UNVALIDATE),
});

async function permsForRole(client, roleName) {
  const role = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  if (!role.rows[0]) return null;
  const res = await client.query(
    `SELECT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1`,
    [role.rows[0].id]
  );
  return res.rows.map((r) => r.code);
}

async function main() {
  const client = await pool.connect();
  const errors = [];

  try {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      const perms = await permsForRole(client, role);
      if (!perms) {
        errors.push(`Role missing in DB: ${role}`);
        continue;
      }

      const filePerms = ROLE_PERMISSIONS[role] || [];
      for (const code of filePerms) {
        if (!perms.includes(code)) {
          errors.push(`${role}: DB missing ${code} (defined in permissions.js)`);
        }
      }

      const checks = expectedResultsAccess(perms, role);
      const fileChecks = expectedResultsAccess(filePerms, role);
      for (const key of Object.keys(checks)) {
        if (checks[key] !== fileChecks[key]) {
          errors.push(`${role}: DB/file mismatch on ${key} (db=${checks[key]}, file=${fileChecks[key]})`);
        }
      }

      console.log(
        `${role}: enter=${checks.enter} edit=${checks.edit} validate=${checks.validate} unvalidate=${checks.unvalidate}`
      );
    }

    if (errors.length) {
      console.error('\nFAILED:');
      errors.forEach((e) => console.error(' -', e));
      process.exit(1);
    }
    console.log('\nOK — all roles match permissions.js.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
