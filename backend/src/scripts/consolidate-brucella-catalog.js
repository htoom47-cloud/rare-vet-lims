/**
 * Deactivate duplicate Brucella Rose Bengal catalog entry (150 SAR / BRU-ROSE-BENGAL)
 * and keep the lab's BRUCELLA test (typically 50 SAR) as the single active MICRO brucella test.
 *
 * Usage:
 *   node src/scripts/consolidate-brucella-catalog.js           # dry-run
 *   node src/scripts/consolidate-brucella-catalog.js --fix     # apply
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const logger = require('../config/logger');

const FIX = process.argv.includes('--fix');

const BRUCELLA_PARAMS = [
  { code: 'RESULT', name: 'Rose Bengal', name_ar: 'روز بنغال', unit: 'qual' },
  { code: 'NOTES', name: 'Comments', name_ar: 'ملاحظات', unit: '' },
];

async function seedBrucellaParameters(testId, client = null) {
  const run = (text, params) => (client ? client.query(text, params) : query(text, params));
  for (let i = 0; i < BRUCELLA_PARAMS.length; i += 1) {
    const param = BRUCELLA_PARAMS[i];
    const existing = await run(
      'SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2',
      [testId, param.code]
    );
    if (!existing.rows[0]) {
      await run(
        `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testId, param.code, param.name, param.name_ar, param.unit, i]
      );
    } else {
      await run(
        `UPDATE test_parameters
         SET sort_order = $1, name = $2, name_ar = $3, unit = $4, is_active = true
         WHERE id = $5`,
        [i, param.name, param.name_ar, param.unit, existing.rows[0].id]
      );
    }
  }
}

const isDuplicateRoseBengal150 = (row) =>
  row.code === 'BRU-ROSE-BENGAL' && Number(row.price) === 150;

const isPreferredKeeper = (row) =>
  row.code === 'BRUCELLA'
  || (Number(row.price) === 50 && /bruc/i.test(`${row.name} ${row.name_ar || ''}`));

const pickKeeper = (rows) => {
  const active = rows.filter((r) => r.is_active !== false);
  const poolRows = active.length ? active : rows;
  return poolRows.find(isPreferredKeeper)
    || [...poolRows].sort((a, b) => b.usage_count - a.usage_count)[0]
    || null;
};

const pickDuplicate = (rows, keeperId) =>
  rows.find((r) => isDuplicateRoseBengal150(r) && r.id !== keeperId) || null;

async function loadBrucellaCandidates(client) {
  const result = await client.query(
    `SELECT t.id, t.code, t.name, t.name_ar, t.price, t.is_active, t.category_id,
            tc.code AS category_code,
            (SELECT COUNT(*)::int FROM sample_tests st WHERE st.test_id = t.id) AS usage_count,
            (SELECT COUNT(*)::int FROM package_tests pt WHERE pt.test_id = t.id) AS package_links,
            (SELECT COUNT(*)::int FROM invoice_items ii WHERE ii.test_id = t.id) AS invoice_links
     FROM tests t
     LEFT JOIN test_categories tc ON tc.id = t.category_id
     WHERE t.code = 'BRU-ROSE-BENGAL'
        OR t.code ILIKE 'BRUCELLA'
        OR t.name ILIKE '%BRUCELLA%'
        OR t.name ILIKE '%rose%bengal%'
        OR COALESCE(t.name_ar, '') ILIKE '%مالط%'
     ORDER BY usage_count DESC, t.created_at ASC`
  );
  return result.rows;
}

async function migrateSampleTests(client, fromTestId, toTestId) {
  const dupRows = await client.query(
    'SELECT id, sample_id FROM sample_tests WHERE test_id = $1',
    [fromTestId]
  );

  let moved = 0;
  let removed = 0;

  for (const row of dupRows.rows) {
    const clash = await client.query(
      'SELECT id FROM sample_tests WHERE sample_id = $1 AND test_id = $2',
      [row.sample_id, toTestId]
    );
    if (clash.rows[0]) {
      const dupResults = await client.query(
        'SELECT id FROM results WHERE sample_test_id = $1',
        [row.id]
      );
      if (!dupResults.rows.length) {
        await client.query('DELETE FROM sample_tests WHERE id = $1', [row.id]);
        removed += 1;
      } else {
        logger.warn('Skipped duplicate sample_test with results', {
          sample_test_id: row.id,
          sample_id: row.sample_id,
        });
      }
      continue;
    }
    await client.query(
      'UPDATE sample_tests SET test_id = $1 WHERE id = $2',
      [toTestId, row.id]
    );
    moved += 1;
  }

  return { moved, removed };
}

async function consolidateBrucellaCatalog(client, { apply = false } = {}) {
  const micro = await client.query(
    `SELECT id FROM test_categories WHERE code = 'MICRO' LIMIT 1`
  );
  const microId = micro.rows[0]?.id;
  if (!microId) {
    return { ok: false, reason: 'MICRO category missing' };
  }

  const candidates = await loadBrucellaCandidates(client);
  if (!candidates.length) {
    return { ok: true, action: 'none', message: 'No brucella tests found' };
  }

  const keeper = pickKeeper(candidates);
  const duplicate = keeper ? pickDuplicate(candidates, keeper.id) : candidates.find(isDuplicateRoseBengal150);

  const report = {
    ok: true,
    apply,
    keeper: keeper ? {
      id: keeper.id,
      code: keeper.code,
      name: keeper.name,
      price: keeper.price,
      usage_count: keeper.usage_count,
    } : null,
    duplicate: duplicate ? {
      id: duplicate.id,
      code: duplicate.code,
      name: duplicate.name,
      price: duplicate.price,
      usage_count: duplicate.usage_count,
      package_links: duplicate.package_links,
      invoice_links: duplicate.invoice_links,
    } : null,
    sampleTests: { moved: 0, removed: 0 },
    packagesUpdated: 0,
    invoicesUpdated: 0,
  };

  if (!duplicate) {
    report.action = 'no-duplicate-150';
    if (keeper && apply) {
      await client.query(
        `UPDATE tests SET category_id = $1, is_active = true, updated_at = NOW() WHERE id = $2`,
        [microId, keeper.id]
      );
      await seedBrucellaParameters(keeper.id, client);
    }
    return report;
  }

  if (!keeper) {
    report.action = 'deactivate-only';
    if (apply) {
      await client.query(
        `UPDATE tests SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [duplicate.id]
      );
    }
    return report;
  }

  report.action = 'consolidate';

  if (!apply) return report;

    await client.query(
      `UPDATE tests
       SET category_id = $1, is_active = true, updated_at = NOW()
       WHERE id = $2`,
      [microId, keeper.id]
    );
    await seedBrucellaParameters(keeper.id, client);

  report.sampleTests = await migrateSampleTests(client, duplicate.id, keeper.id);

  const pkg = await client.query(
    `UPDATE package_tests SET test_id = $1
     WHERE test_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM package_tests pt2
         WHERE pt2.package_id = package_tests.package_id AND pt2.test_id = $1
       )
     RETURNING package_id, test_id`,
    [keeper.id, duplicate.id]
  );
  report.packagesUpdated = pkg.rowCount;
  await client.query('DELETE FROM package_tests WHERE test_id = $1', [duplicate.id]);

  await client.query(
    `UPDATE invoice_items SET test_id = $1 WHERE test_id = $2`,
    [keeper.id, duplicate.id]
  );
  report.invoicesUpdated = duplicate.invoice_links;

  await client.query(
    `UPDATE tests SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [duplicate.id]
  );

  return report;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n=== Consolidate Brucella catalog (${FIX ? 'APPLY' : 'DRY RUN'}) ===\n`);
    if (FIX) await client.query('BEGIN');

    const result = await consolidateBrucellaCatalog(client, { apply: FIX });

    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      if (FIX) await client.query('ROLLBACK');
      process.exit(1);
    }

    if (FIX) {
      await client.query('COMMIT');
      console.log('\n✅ Applied successfully.');
    } else {
      console.log('\n⚠️  Dry run — pass --fix to apply.');
    }
  } catch (err) {
    if (FIX) await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { consolidateBrucellaCatalog, loadBrucellaCandidates };
