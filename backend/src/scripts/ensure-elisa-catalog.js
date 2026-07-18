/**
 * Ensure every ELISA-category (or ELISA-named) test has:
 * - category ELISA
 * - method ELISA
 * - parameters SP-RATIO (%) + RESULT (qual)
 *
 * Idempotent — safe to run from migrate. Does not touch PCR / MICRO brucella.
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const logger = require('../config/logger');

const WANTED = [
  { code: 'SP-RATIO', name: 'S/P%', name_ar: 'S/P%', unit: '%', sort_order: 0 },
  { code: 'RESULT', name: 'Result', name_ar: 'النتيجة', unit: 'qual', sort_order: 1 },
];

const ensureElisaCatalog = async () => {
  const cat = await query(`SELECT id FROM test_categories WHERE code = 'ELISA' LIMIT 1`);
  if (!cat.rows[0]) {
    logger.warn('ELISA category missing — skipping ELISA catalog ensure');
    return { ok: false, reason: 'ELISA category missing' };
  }
  const elisaId = cat.rows[0].id;

  const tests = await query(
    `SELECT t.id, t.code, t.name
     FROM tests t
     LEFT JOIN test_categories tc ON tc.id = t.category_id
     WHERE tc.code = 'ELISA'
        OR t.code ILIKE '%ELISA%'
        OR t.name ILIKE '%ELISA%'
        OR COALESCE(t.name_ar, '') ILIKE '%إليزا%'
        OR COALESCE(t.name_ar, '') ILIKE '%اليزا%'`
  );

  let updated = 0;
  for (const test of tests.rows) {
    // Never reclassify PCR
    if (String(test.code).toUpperCase().startsWith('PCR')) continue;

    await query(
      `UPDATE tests
       SET category_id = $1,
           method = COALESCE(NULLIF(TRIM(method), ''), 'ELISA'),
           updated_at = NOW()
       WHERE id = $2`,
      [elisaId, test.id]
    );

    for (const p of WANTED) {
      const existing = await query(
        `SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2`,
        [test.id, p.code]
      );
      if (existing.rows[0]) {
        await query(
          `UPDATE test_parameters
           SET name = $1, name_ar = $2, unit = $3, sort_order = $4, is_active = true
           WHERE id = $5`,
          [p.name, p.name_ar, p.unit, p.sort_order, existing.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [test.id, p.code, p.name, p.name_ar, p.unit, p.sort_order]
        );
      }
    }
    updated += 1;
  }

  logger.info('ELISA catalog ensured', { tests: updated });
  return { ok: true, tests: updated };
};

if (require.main === module) {
  ensureElisaCatalog()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-elisa-catalog failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureElisaCatalog };
