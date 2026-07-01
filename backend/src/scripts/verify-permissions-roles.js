/**
 * Verify role → permission matrix for results.* (no HTTP server).
 * Usage: node src/scripts/verify-permissions-roles.js
 */
require('dotenv').config();
const { pool } = require('../config/database');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../utils/permissions');

const authorize = (userPerms, roleName, ...required) =>
  required.some((p) => userPerms.includes(p) || roleName === 'admin');

const CASES = [
  {
    role: 'veterinarian',
    expect: {
      enter: true, // results.edit also grants POST /results/enter
      edit: true,
      validate: true,
      unvalidate: true,
    },
  },
  {
    role: 'lab_specialist',
    expect: {
      enter: true,
      edit: true,
      validate: true,
      unvalidate: true,
    },
  },
  {
    role: 'lab_technician',
    expect: {
      enter: true,
      edit: true,
      validate: false,
      unvalidate: false,
    },
  },
  {
    role: 'reception',
    expect: {
      enter: false,
      edit: false,
      validate: false,
      unvalidate: false,
    },
  },
];

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
    for (const { role, expect } of CASES) {
      const perms = await permsForRole(client, role);
      if (!perms) {
        errors.push(`Role missing in DB: ${role}`);
        continue;
      }

      const filePerms = new Set(ROLE_PERMISSIONS[role] || []);
      for (const code of filePerms) {
        if (!perms.includes(code)) {
          errors.push(`${role}: DB missing ${code} (defined in permissions.js)`);
        }
      }

      const checks = {
        enter: authorize(perms, role, PERMISSIONS.RESULTS_ENTER, PERMISSIONS.RESULTS_EDIT),
        edit: authorize(perms, role, PERMISSIONS.RESULTS_EDIT),
        validate: authorize(perms, role, PERMISSIONS.RESULTS_VALIDATE),
        unvalidate: authorize(perms, role, PERMISSIONS.RESULTS_UNVALIDATE),
      };

      for (const [key, wanted] of Object.entries(expect)) {
        if (checks[key] !== wanted) {
          errors.push(`${role}: route guard ${key} expected ${wanted}, got ${checks[key]}`);
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
    console.log('\nOK — role permission matrix matches expectations.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
