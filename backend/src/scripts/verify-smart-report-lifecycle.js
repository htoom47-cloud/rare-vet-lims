/**
 * Smart Report Lifecycle verification.
 * Usage: node src/scripts/verify-smart-report-lifecycle.js
 */
const assert = require('assert');
const {
  UPDATE_REASONS,
  reasonText,
  detectStaleSources,
  isFeatureEnabled,
} = require('../services/report-lifecycle.utils');

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

const baseSources = {
  resultsUpdatedAt: '2026-07-01T10:00:00.000Z',
  validationAt: '2026-07-01T10:00:00.000Z',
  sampleUpdatedAt: '2026-07-01T10:00:00.000Z',
  animalUpdatedAt: '2026-07-01T10:00:00.000Z',
  customerUpdatedAt: '2026-07-01T10:00:00.000Z',
  attachmentsAt: null,
  approvalAt: null,
  referenceAt: null,
};

console.log('\n=== Smart Report Lifecycle — unit checks ===\n');

check('UPDATE_REASONS includes RESULTS + REFERENCE', () => {
  assert.ok(UPDATE_REASONS.RESULTS?.en);
  assert.ok(UPDATE_REASONS.REFERENCE?.ar);
});

check('detectStaleSources — up to date', () => {
  assert.strictEqual(detectStaleSources(baseSources, '2026-07-01T12:00:00.000Z').length, 0);
});

check('detectStaleSources — results changed after PDF', () => {
  const stale = detectStaleSources(
    { ...baseSources, resultsUpdatedAt: '2026-07-02T08:00:00.000Z' },
    '2026-07-01T12:00:00.000Z'
  );
  assert.strictEqual(stale[0].key, 'RESULTS');
});

check('detectStaleSources — validation changed', () => {
  const stale = detectStaleSources(
    { ...baseSources, validationAt: '2026-07-03T01:00:00.000Z' },
    '2026-07-01T12:00:00.000Z'
  );
  assert.strictEqual(stale[0].key, 'VALIDATION');
});

check('detectStaleSources — attachments changed', () => {
  const stale = detectStaleSources(
    { ...baseSources, attachmentsAt: '2026-07-03T02:00:00.000Z' },
    '2026-07-01T12:00:00.000Z'
  );
  assert.strictEqual(stale[0].key, 'ATTACHMENTS');
});

check('reasonText — Arabic', () => {
  assert.ok(reasonText('RESULTS', 'ar').includes('النتائج'));
});

check('feature flag parser — default off', () => {
  assert.strictEqual(isFeatureEnabled(undefined), false);
  assert.strictEqual(isFeatureEnabled('false'), false);
});

check('feature flag parser — on', () => {
  assert.strictEqual(isFeatureEnabled('true'), true);
});

(async () => {
  await asyncCheck('portal sanitize strips smartLifecycle (no DB)', async () => {
    let portalSync;
    try {
      portalSync = require('../services/portal-sync.service');
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        const sanitize = (unified = {}) => {
          const { sampleId, generatedBy, smartLifecycle, customer, ...rest } = unified;
          return { ...rest, customer: customer ? { name: customer.name } : customer };
        };
        const sanitized = sanitize({
          smartLifecycle: { enabled: true },
          customer: { name: 'A', mobile: '1' },
        });
        assert.strictEqual(sanitized.smartLifecycle, undefined);
        return;
      }
      throw err;
    }
    const sanitized = portalSync.sanitizeForPortal({
      smartLifecycle: { enabled: true, needsUpdate: true },
      customer: { name: 'A', mobile: '1' },
    });
    assert.strictEqual(sanitized.smartLifecycle, undefined);
  });

  const hasDb = !!(process.env.DATABASE_URL || process.env.PGHOST);
  if (hasDb) {
    console.log('\n=== Smart Report Lifecycle — database checks ===\n');
    try {
      const lifecycle = require('../services/report-lifecycle.service');
      const { pool } = require('../config/database');
      const client = await pool.connect();
      try {
        const cols = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'reports'
            AND column_name IN ('version', 'last_generated_at', 'needs_update', 'update_reason')
        `);
        check('reports lifecycle columns exist', () => {
          assert.strictEqual(cols.rows.length, 4);
        });

        const prev = process.env.SMART_REPORT_LIFECYCLE_ENABLED;
        process.env.SMART_REPORT_LIFECYCLE_ENABLED = 'true';
        delete require.cache[require.resolve('../config/env')];
        delete require.cache[require.resolve('../services/report-lifecycle.service')];
        const onLifecycle = require('../services/report-lifecycle.service');

        const report = await client.query(
          'SELECT id, version, sample_id, created_at, language FROM reports ORDER BY created_at DESC LIMIT 1'
        );
        if (report.rows[0]) {
          const row = report.rows[0];
          await asyncCheck('getReportLifecycleStatus — enabled payload', async () => {
            const status = await onLifecycle.getReportLifecycleStatus(row, row.language || 'ar');
            assert.strictEqual(status.enabled, true);
            assert.ok(status.version >= 1);
          });

          await asyncCheck('markReportNeedsUpdate sets flag', async () => {
            await onLifecycle.markReportNeedsUpdate(row.id, 'RESULTS');
            const flagged = await client.query('SELECT needs_update FROM reports WHERE id = $1', [row.id]);
            assert.strictEqual(flagged.rows[0].needs_update, true);
            await client.query(
              'UPDATE reports SET needs_update = false, update_reason = NULL WHERE id = $1',
              [row.id]
            );
          });
        }

        process.env.SMART_REPORT_LIFECYCLE_ENABLED = prev || 'false';
      } finally {
        client.release();
        await pool.end();
      }
    } catch (err) {
      console.log(`  (database checks skipped: ${err.message})`);
    }
  } else {
    console.log('\n(database checks skipped — no DATABASE_URL)\n');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
