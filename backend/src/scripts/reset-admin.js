const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

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
    const existing = await pool.query('SELECT id, email FROM users WHERE email = $1', [ADMIN_EMAIL]);

    if (existing.rows[0]) {
      await pool.query(
        'UPDATE users SET password_hash = $1, is_active = true, updated_at = NOW() WHERE id = $2',
        [hash, existing.rows[0].id]
      );
      console.log('Password reset for:', existing.rows[0].email);
    } else {
      await pool.query(
        `INSERT INTO users (email, password_hash, full_name, full_name_ar, role_id, is_active)
         VALUES ($1, $2, 'System Admin', 'مدير النظام', $3, true)`,
        [ADMIN_EMAIL, hash, roleResult.rows[0].id]
      );
      console.log('Admin created:', ADMIN_EMAIL);
    }

    console.log('LOGIN:', ADMIN_EMAIL, '/', NEW_PASSWORD);
  } finally {
    await pool.end();
  }
}

resetAdmin().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
