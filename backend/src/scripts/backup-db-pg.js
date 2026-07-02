/**
 * Pre-deploy production backup using pg (no pg_dump required).
 * Set DATABASE_URL to Render external connection string before running.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');

async function main() {
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    console.error('Render → rare-vet-db → Connect → External Database URL');
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(BACKUP_DIR, `rare-vet-lims-${stamp}-tables.json.gz`);

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );

  const dump = {
    createdAt: new Date().toISOString(),
    database: 'rare_vet_lims',
    tables: {},
  };

  for (const { tablename } of tables.rows) {
    const rows = await client.query(`SELECT * FROM "${tablename}"`);
    dump.tables[tablename] = rows.rows;
    process.stdout.write(`  ${tablename}: ${rows.rowCount} rows\n`);
  }

  await client.end();

  const zlib = require('zlib');
  const json = JSON.stringify(dump);
  fs.writeFileSync(outFile, zlib.gzipSync(json));
  console.log(`Backup saved: ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
