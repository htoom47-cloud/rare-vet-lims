require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function backfillUsernames(client) {
  const hasCol = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username'`
  );
  if (!hasCol.rows[0]) {
    await client.query('ALTER TABLE users ADD COLUMN username VARCHAR(50)');
  }

  const users = await client.query('SELECT id, email, username FROM users');
  for (const u of users.rows) {
    if (u.username) continue;
    let base = (u.email || 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (base.length < 3) base = `user${base}`;
    let candidate = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2',
        [candidate, u.id]
      );
      if (!exists.rows[0]) break;
      candidate = `${base}${n++}`;
    }
    await client.query('UPDATE users SET username = $1 WHERE id = $2', [candidate, u.id]);
  }

  await client.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))'
  );
}

async function applyPatches() {
  const client = await pool.connect();
  try {
    await client.query(
      'ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS animal_id UUID REFERENCES animals(id)'
    );
    await backfillUsernames(client);
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_interpretation TEXT');
    await client.query('ALTER TABLE reports ADD COLUMN IF NOT EXISTS treatment_recommendations TEXT');
  } finally {
    client.release();
  }
}

async function migrate() {
  const check = await pool.query("SELECT to_regclass('public.roles') AS exists");
  if (!check.rows[0].exists) {
    const sqlPath = path.join(__dirname, '../../migrations/init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    logger.info('Database schema created successfully');
  } else {
    logger.info('Database schema exists — applying patches');
  }
  await applyPatches();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
  });
