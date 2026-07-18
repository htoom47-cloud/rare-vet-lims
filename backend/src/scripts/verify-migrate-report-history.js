/**
 * C1 verification — migrate must never delete report history.
 *
 * Usage: node src/scripts/verify-migrate-report-history.js
 *
 * - Static: migrate.js source has no report-history DELETE / unique(sample_id) create
 * - DB (local): insert 2 reports for one sample, re-run patch twice, assert IDs/URLs unchanged
 * - All DB writes roll back — does not mutate lasting data
 */
require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { ensureReportsHistoryPreserved } = require('./migrate');

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const asyncCheck = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const migratePath = path.join(__dirname, 'migrate.js');
const migrateSrc = fs.readFileSync(migratePath, 'utf8');

console.log('\n=== C1 migrate report history — static ===\n');

check('migrate.js has no executable DELETE of older reports', () => {
  // Allow documentation warnings; forbid the old SQL payload (DELETE ... USING).
  assert.ok(!/DELETE\s+FROM\s+reports\s+older\s*\n?\s*USING\s+reports\s+newer/i.test(migrateSrc));
  assert.ok(!/client\.query\(\s*[`'"]\s*DELETE\s+FROM\s+reports/i.test(migrateSrc));
});

check('migrate.js has no CREATE UNIQUE INDEX idx_reports_sample_id_unique', () => {
  assert.ok(!/CREATE\s+UNIQUE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?idx_reports_sample_id_unique/i.test(migrateSrc));
});

check('migrate.js documents unsafe rollback / no UNIQUE reintroduction', () => {
  assert.ok(/HARD RULES/i.test(migrateSrc));
  assert.ok(/SAFE ROLLBACK/i.test(migrateSrc));
  assert.ok(/git revert of the C1 commit is UNSAFE/i.test(migrateSrc));
});

check('migrate.js calls ensureReportsHistoryPreserved', () => {
  assert.ok(migrateSrc.includes('ensureReportsHistoryPreserved'));
  assert.ok(migrateSrc.includes('DROP INDEX IF EXISTS idx_reports_sample_id_unique'));
  assert.ok(migrateSrc.includes('CREATE INDEX IF NOT EXISTS idx_reports_sample_id'));
});

check('cloud-start still invokes migrate.js (boot path)', () => {
  const cloudStart = fs.readFileSync(path.join(__dirname, 'cloud-start.js'), 'utf8');
  assert.ok(cloudStart.includes('src/scripts/migrate.js'));
});

check('no other boot script deletes reports', () => {
  const bootScripts = [
    'sync-lab-contact.js',
    'sync-cbc-params.js',
    'ensure-cbc-reference-ranges.js',
    'reconcile-cbc-reference-codes.js',
    'ensure-species-reference-ranges.js',
    'ensure-result-attachments.js',
    'ensure-parasitology.js',
    'ensure-admin.js',
  ];
  for (const name of bootScripts) {
    const full = path.join(__dirname, name);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    assert.ok(
      !/DELETE\s+FROM\s+reports/i.test(src) && !/TRUNCATE\s+.*reports/i.test(src),
      `${name} must not DELETE/TRUNCATE reports`
    );
  }
});

console.log('\n=== C1 migrate report history — DB (rolled back) ===\n');

(async () => {
  const client = await pool.connect();
  try {
    await asyncCheck('DB reachable', async () => {
      await client.query('SELECT 1');
    });

    await client.query('BEGIN');

    const hasDeletedAt = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'samples' AND column_name = 'deleted_at'`
    );
    const sampleRes = hasDeletedAt.rows[0]
      ? await client.query(
          `SELECT id FROM samples WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`
        )
      : await client.query(`SELECT id FROM samples ORDER BY created_at DESC LIMIT 1`);

    if (!sampleRes.rows[0]) {
      console.log('  ⚠ SKIP DB fixture tests — no samples in local DB');
    } else {
      const sampleId = sampleRes.rows[0].id;
      const id1 = uuidv4();
      const id2 = uuidv4();
      const url1 = `/uploads/reports/c1-hist-${id1}.pdf`;
      const url2 = `/uploads/reports/c1-hist-${id2}.pdf`;
      const num1 = `C1T-${Date.now()}-A`;
      const num2 = `C1T-${Date.now()}-B`;
      const qr1 = `C1QR${uuidv4().slice(0, 8)}A`;
      const qr2 = `C1QR${uuidv4().slice(0, 8)}B`;

      await asyncCheck('drop unique index so two reports can coexist for the test', async () => {
        await ensureReportsHistoryPreserved(client);
      });

      await asyncCheck('insert two reports for the same sample', async () => {
        await client.query(
          `INSERT INTO reports (id, report_number, sample_id, pdf_url, qr_verification_code, language, is_final, created_at)
           VALUES ($1, $2, $3, $4, $5, 'ar', true, NOW() - INTERVAL '1 hour')`,
          [id1, num1, sampleId, url1, qr1]
        );
        await client.query(
          `INSERT INTO reports (id, report_number, sample_id, pdf_url, qr_verification_code, language, is_final, created_at)
           VALUES ($1, $2, $3, $4, $5, 'ar', true, NOW())`,
          [id2, num2, sampleId, url2, qr2]
        );
      });

      await asyncCheck('both reports present before re-patch', async () => {
        const rows = await client.query(
          `SELECT id, pdf_url FROM reports WHERE id = ANY($1::uuid[]) ORDER BY created_at ASC`,
          [[id1, id2]]
        );
        assert.strictEqual(rows.rows.length, 2);
        assert.strictEqual(rows.rows[0].id, id1);
        assert.strictEqual(rows.rows[0].pdf_url, url1);
        assert.strictEqual(rows.rows[1].id, id2);
        assert.strictEqual(rows.rows[1].pdf_url, url2);
      });

      await asyncCheck('re-run ensureReportsHistoryPreserved twice — no delete', async () => {
        await ensureReportsHistoryPreserved(client);
        await ensureReportsHistoryPreserved(client);
        const rows = await client.query(
          `SELECT id, pdf_url, report_number FROM reports WHERE id = ANY($1::uuid[]) ORDER BY created_at ASC`,
          [[id1, id2]]
        );
        assert.strictEqual(rows.rows.length, 2, 'both historical reports must remain');
        assert.strictEqual(rows.rows[0].id, id1);
        assert.strictEqual(rows.rows[0].pdf_url, url1);
        assert.strictEqual(rows.rows[0].report_number, num1);
        assert.strictEqual(rows.rows[1].id, id2);
        assert.strictEqual(rows.rows[1].pdf_url, url2);
        assert.strictEqual(rows.rows[1].report_number, num2);
      });

      await asyncCheck('no duplicate rows created by re-running the patch', async () => {
        const count = await client.query(
          `SELECT COUNT(*)::int AS n FROM reports WHERE sample_id = $1 AND id = ANY($2::uuid[])`,
          [sampleId, [id1, id2]]
        );
        assert.strictEqual(count.rows[0].n, 2);
      });

      await asyncCheck('unique(sample_id) index is absent after patch', async () => {
        const idx = await client.query(
          `SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname = 'idx_reports_sample_id_unique'`
        );
        assert.strictEqual(idx.rows.length, 0);
      });

      await asyncCheck('non-unique lookup index exists', async () => {
        const idx = await client.query(
          `SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname = 'idx_reports_sample_id'`
        );
        assert.strictEqual(idx.rows.length, 1);
      });
    }

    await client.query('ROLLBACK');
    console.log('\n  (transaction rolled back — local DB left unchanged)\n');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    failed += 1;
    console.error(`  ✗ DB suite aborted: ${err.message}`);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
})();
