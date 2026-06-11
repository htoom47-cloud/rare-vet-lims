const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@rarevetcare.com').toLowerCase();
const NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD || process.argv[2];

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes('@base')) {
    console.error('ERROR: DATABASE_URL not set or invalid.');
    console.error('In CMD run first (with your Render External Database URL):');
    console.error('  set "DATABASE_URL=postgresql://..."');
    process.exit(1);
  }
  return new Pool({
    connectionString: url,
    ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  });
}

async function resetAdmin() {
  if (!NEW_PASSWORD || NEW_PASSWORD.length < 6) {
    console.error('Usage: node src/scripts/reset-admin.js <new-password>');
    process.exit(1);
  }

  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    console.log('DB connected OK');

    const roleResult = await pool.query(`SELECT id FROM roles WHERE name = 'admin'`);
    if (!roleResult.rows[0]) throw new Error('Admin role not found — run seed first');

    const hash = await bcrypt.hash(NEW_PASSWORD, 12);
    const existing = await pool.query(
      'SELECT id, username, email FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
      [ADMIN_USERNAME, ADMIN_EMAIL]
    );

    if (existing.rows[0]) {
      await pool.query(
        'UPDATE users SET username = $1, password_hash = $2, is_active = true, updated_at = NOW() WHERE id = $3',
        [ADMIN_USERNAME, hash, existing.rows[0].id]
      );
      console.log('Password reset for:', existing.rows[0].username || ADMIN_USERNAME);
    } else {
      await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, full_name_ar, role_id, is_active)
         VALUES ($1, $2, $3, 'System Admin', 'مدير النظام', $4, true)`,
        [ADMIN_USERNAME, ADMIN_EMAIL, hash, roleResult.rows[0].id]
      );
      console.log('Admin created:', ADMIN_USERNAME);
    }

    console.log('LOGIN:', ADMIN_USERNAME, '/', NEW_PASSWORD);
  } finally {
    await pool.end();
  }
}

resetAdmin().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
