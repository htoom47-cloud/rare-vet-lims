const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEMO_USERS = [
  { username: 'reception', email: 'reception@rarevetcare.com', password: 'Reception@123', full_name: 'Reception Desk', full_name_ar: 'الاستقبال', role: 'reception' },
  { username: 'tech', email: 'tech@rarevetcare.com', password: 'Tech@123', full_name: 'Lab Technician', full_name_ar: 'فني المختبر', role: 'lab_technician' },
  { username: 'vet', email: 'vet@rarevetcare.com', password: 'Vet@123', full_name: 'Dr. Veterinarian', full_name_ar: 'الطبيب البيطري', role: 'veterinarian' },
  { username: 'accountant', email: 'accountant@rarevetcare.com', password: 'Account@123', full_name: 'Accountant', full_name_ar: 'المحاسب', role: 'accountant' },
  { username: 'manager', email: 'manager@rarevetcare.com', password: 'Manager@123', full_name: 'Lab Manager', full_name_ar: 'مدير المختبر', role: 'manager' },
];

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes('@base')) {
    console.error('ERROR: DATABASE_URL not set or invalid.');
    console.error('  set "DATABASE_URL=postgresql://..."');
    process.exit(1);
  }
  return new Pool({
    connectionString: url,
    ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  });
}

async function main() {
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    console.log('DB connected OK\n');

    for (const user of DEMO_USERS) {
      const role = await pool.query('SELECT id FROM roles WHERE name = $1', [user.role]);
      if (!role.rows[0]) {
        console.log('SKIP (no role):', user.role);
        continue;
      }
      const hash = await bcrypt.hash(user.password, 12);
      const username = user.username.toLowerCase();
      const email = user.email.toLowerCase();
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
        [username, email]
      );
      if (existing.rows[0]) {
        await pool.query(
          'UPDATE users SET username=$1, password_hash=$2, full_name=$3, full_name_ar=$4, role_id=$5, email=$6, is_active=true WHERE id=$7',
          [username, hash, user.full_name, user.full_name_ar, role.rows[0].id, email, existing.rows[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO users (username, email, password_hash, full_name, full_name_ar, role_id, is_active) VALUES ($1,$2,$3,$4,$5,$6,true)',
          [username, email, hash, user.full_name, user.full_name_ar, role.rows[0].id]
        );
      }
      console.log('OK:', username, '/', user.password);
    }
    console.log('\nDONE');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
