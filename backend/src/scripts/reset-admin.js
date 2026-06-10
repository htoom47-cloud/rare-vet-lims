require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/database');
const logger = require('../config/logger');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@rarevetcare.com').toLowerCase();
const NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD || process.argv[2];

async function resetAdmin() {
  if (!NEW_PASSWORD || NEW_PASSWORD.length < 6) {
    console.error('Usage: node src/scripts/reset-admin.js <new-password>');
    console.error('Or set ADMIN_NEW_PASSWORD in environment (min 6 characters).');
    process.exit(1);
  }

  const roleResult = await query(`SELECT id FROM roles WHERE name = 'admin'`);
  if (!roleResult.rows[0]) {
    throw new Error('Admin role not found — run migrate and seed first.');
  }
  const roleId = roleResult.rows[0].id;

  const admins = await query(
    `SELECT u.id, u.email, u.is_active FROM users u WHERE u.role_id = $1 ORDER BY u.created_at`,
    [roleId]
  );

  if (admins.rows.length) {
    console.log('Admin account(s) in database:');
    admins.rows.forEach((a) => console.log(`  - ${a.email} (${a.is_active ? 'active' : 'inactive'})`));
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  let target = admins.rows.find((a) => a.email === ADMIN_EMAIL);

  if (target) {
    await query(
      `UPDATE users SET password_hash = $1, is_active = true, updated_at = NOW() WHERE id = $2`,
      [hash, target.id]
    );
    console.log(`\nPassword reset for: ${target.email}`);
  } else if (admins.rows.length) {
    target = admins.rows[0];
    await query(
      `UPDATE users SET password_hash = $1, is_active = true, updated_at = NOW() WHERE id = $2`,
      [hash, target.id]
    );
    console.log(`\nPassword reset for existing admin: ${target.email}`);
  } else {
    await query(
      `INSERT INTO users (email, password_hash, full_name, full_name_ar, role_id, is_active)
       VALUES ($1, $2, 'System Admin', 'مدير النظام', $3, true)`,
      [ADMIN_EMAIL, hash, roleId]
    );
    console.log(`\nAdmin account created: ${ADMIN_EMAIL}`);
  }

  console.log('\nYou can now sign in with the email above and your new password.');
}

resetAdmin()
  .then(() => pool.end())
  .catch((err) => {
    logger.error('Reset failed', { error: err.message });
    console.error(err.message);
    pool.end();
    process.exit(1);
  });
