/**
 * C1 deploy checks — READ ONLY (no DDL/DML).
 *
 * Usage:
 *   node src/scripts/check-report-history-deploy.js pre
 *   node src/scripts/check-report-history-deploy.js post
 *
 * Pre-deploy: list reports indexes + samples with multiple report versions.
 * Post-deploy expected:
 *   old_unique_index = null
 *   new_search_index = idx_reports_sample_id
 *
 * SAFE ROLLBACK POLICY (do not violate):
 * - Do NOT redeploy a build that still contains DELETE FROM reports older...
 * - Do NOT recreate UNIQUE(sample_id) / idx_reports_sample_id_unique
 * - Do NOT delete reports to "fix" a deploy
 * - If the new release misbehaves: hotfix forward, or restore from DB backup —
 *   never reintroduce the destructive migrate path
 */
require('dotenv').config();
const { pool } = require('../config/database');

const mode = (process.argv[2] || 'pre').toLowerCase();

const print = (title, rows) => {
  console.log(`\n=== ${title} ===`);
  if (!rows.length) {
    console.log('(no rows)');
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
};

(async () => {
  if (!['pre', 'post'].includes(mode)) {
    console.error('Usage: node src/scripts/check-report-history-deploy.js [pre|post]');
    process.exit(2);
  }

  console.log(`C1 report-history deploy check (${mode}) — READ ONLY`);
  console.log('WARNING: Never reintroduce UNIQUE(sample_id) or DELETE of older reports.');
  console.log('Multiple reports per sample is an intentional design after C1.');

  if (mode === 'pre') {
    print(
      'reports indexes',
      (await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'reports'
        ORDER BY indexname
      `)).rows
    );

    print(
      'reports constraints',
      (await pool.query(`
        SELECT
          c.conname,
          c.contype,
          pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'reports'
        ORDER BY c.conname
      `)).rows
    );

    print(
      'samples with more than one report',
      (await pool.query(`
        SELECT sample_id, COUNT(*) AS reports_count
        FROM reports
        WHERE sample_id IS NOT NULL
        GROUP BY sample_id
        HAVING COUNT(*) > 1
        ORDER BY reports_count DESC
      `)).rows
    );
  } else {
    const reg = (await pool.query(`
      SELECT
        to_regclass('public.idx_reports_sample_id_unique') AS old_unique_index,
        to_regclass('public.idx_reports_sample_id') AS new_search_index
    `)).rows[0];

    print('post-deploy index regclass', [reg]);

    const oldOk = reg.old_unique_index == null;
    const newOk = String(reg.new_search_index || '') === 'idx_reports_sample_id';

    console.log('\n=== expectation ===');
    console.log(`old_unique_index = NULL  → ${oldOk ? 'PASS' : 'FAIL'} (got ${reg.old_unique_index})`);
    console.log(`new_search_index = idx_reports_sample_id → ${newOk ? 'PASS' : 'FAIL'} (got ${reg.new_search_index})`);

    if (!oldOk || !newOk) {
      await pool.end();
      process.exit(1);
    }
  }

  await pool.end();
  console.log('\nDone (no schema/data changes).\n');
})().catch(async (err) => {
  console.error(err.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
