/**
 * Read-only inspection of reports indexes / constraints.
 * Usage: node src/scripts/inspect-reports-indexes.js
 */
require('dotenv').config();
const { pool } = require('../config/database');

const run = async (label, sql) => {
  const r = await pool.query(sql);
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(r.rows, null, 2));
  return r.rows;
};

(async () => {
  await run('pg_indexes (reports)', `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'reports'
    ORDER BY indexname
  `);

  await run('pg_constraint (reports)', `
    SELECT
      c.conname,
      c.contype,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'reports'
    ORDER BY c.conname
  `);

  await run('index ownership (reports)', `
    SELECT
      i.relname AS index_name,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_pk,
      con.conname AS owning_constraint,
      con.contype AS constraint_type
    FROM pg_class t
    JOIN pg_index ix ON ix.indrelid = t.oid
    JOIN pg_class i ON i.oid = ix.indexrelid
    LEFT JOIN pg_constraint con ON con.conindid = i.oid
    WHERE t.relname = 'reports'
    ORDER BY i.relname
  `);

  await run('regclass check', `
    SELECT
      to_regclass('public.idx_reports_sample_id_unique') AS old_unique_index,
      to_regclass('public.idx_reports_sample_id') AS new_search_index
  `);

  await run('samples with multiple reports', `
    SELECT sample_id, COUNT(*) AS reports_count
    FROM reports
    WHERE sample_id IS NOT NULL
    GROUP BY sample_id
    HAVING COUNT(*) > 1
    ORDER BY reports_count DESC
    LIMIT 20
  `);

  await pool.end();
})().catch(async (err) => {
  console.error(err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
