/**
 * Usage: node src/scripts/check-user-perms.js <username>
 */
require('dotenv').config();
const { pool } = require('../config/database');

const q = (process.argv[2] || '').trim();
if (!q) {
  console.error('Usage: node src/scripts/check-user-perms.js <username>');
  process.exit(1);
}

(async () => {
  const client = await pool.connect();
  try {
    const users = await client.query(
      `SELECT u.id, u.username, u.full_name, u.full_name_ar, u.is_active, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.username ILIKE $1 OR u.full_name ILIKE $1 OR u.full_name_ar ILIKE $1
       ORDER BY u.username`,
      [`%${q}%`]
    );

    if (!users.rows.length) {
      console.log('No users found matching:', q);
      process.exit(1);
    }

    for (const u of users.rows) {
      const perms = await client.query(
        `SELECT p.code FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         JOIN users u2 ON u2.role_id = rp.role_id
         WHERE u2.id = $1
         ORDER BY p.code`,
        [u.id]
      );
      const results = perms.rows.map((r) => r.code).filter((c) => c.startsWith('results.'));
      console.log('---');
      console.log('Username:', u.username);
      console.log('Name:', u.full_name, '/', u.full_name_ar);
      console.log('Role:', u.role);
      console.log('Active:', u.is_active);
      console.log('Results permissions:', results.join(', ') || '(none)');
    }
  } finally {
    client.release();
    await pool.end();
  }
})();
