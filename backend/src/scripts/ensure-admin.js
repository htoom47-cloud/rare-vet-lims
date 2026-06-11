require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function ensureAdmin() {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const email = (process.env.ADMIN_EMAIL || 'admin@rarevetcare.com').toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  const role = await pool.query("SELECT id FROM roles WHERE name = 'admin'");
  if (!role.rows[0]) {
    logger.warn('Admin role missing — run seed first');
    return;
  }

  const existing = await pool.query(
    `SELECT u.id, u.username FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE r.name = 'admin'
     ORDER BY u.created_at ASC
     LIMIT 1`
  );

  if (existing.rows[0]) {
    const userId = existing.rows[0].id;
    const fields = [];
    const params = [];
    let idx = 1;

    const dup = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2',
      [username, userId]
    );
    if (!dup.rows[0]) {
      fields.push(`username = $${idx++}`);
      params.push(username);
    }

    fields.push(`email = $${idx++}`);
    params.push(email);
    fields.push('is_active = true');

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      fields.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    fields.push('updated_at = NOW()');
    params.push(userId);
    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
      params
    );
    logger.info('Admin account verified', { username, passwordReset: Boolean(password) });
    return;
  }

  if (!password) {
    logger.warn('No admin user found and ADMIN_INITIAL_PASSWORD not set');
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, full_name_ar, role_id, is_active)
     VALUES ($1, $2, $3, 'System Admin', 'مدير النظام', $4, true)`,
    [username, email, hash, role.rows[0].id]
  );
  logger.info('Admin account created', { username });
}

if (require.main === module) {
  ensureAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('ensure-admin failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureAdmin };
