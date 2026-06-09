require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function applyPatches() {
  await pool.query(
    'ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS animal_id UUID REFERENCES animals(id)'
  );
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
