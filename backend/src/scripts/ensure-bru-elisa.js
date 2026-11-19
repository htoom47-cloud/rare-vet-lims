/**
 * Ensure Brucella ELISA (إليزا المالطية) catalog test for herd list entry.
 * Idempotent — does not touch MICRO Rose Bengal (BRUCELLA / BRU-ROSE-BENGAL).
 * Usage: node src/scripts/ensure-bru-elisa.js
 */
const { query, pool } = require('../config/database');
const logger = require('../config/logger');

const TEST = {
  code: 'BRU-ELISA',
  name: 'Brucella ELISA',
  name_ar: 'إليزا المالطية',
  price: 80,
  method: 'ELISA',
  turnaround_hours: 48,
};

const PARAMS = [
  { code: 'SP-RATIO', name: 'S/P%', name_ar: 'S/P%', unit: '%', sort_order: 0 },
  { code: 'RESULT', name: 'Result', name_ar: 'النتيجة', unit: 'qual', sort_order: 1 },
];

const ensureBruElisaCatalog = async () => {
  let cat = await query(`SELECT id FROM test_categories WHERE code = 'ELISA' LIMIT 1`);
  if (!cat.rows[0]) {
    const inserted = await query(
      `INSERT INTO test_categories (code, name, name_ar, department, sort_order, is_active)
       VALUES ('ELISA', 'ELISA', 'إليزا', 'Lab', 40, true)
       RETURNING id`
    );
    cat = inserted;
  }
  const categoryId = cat.rows[0].id;

  let test = await query(`SELECT id FROM tests WHERE code = $1 LIMIT 1`, [TEST.code]);
  if (test.rows[0]) {
    await query(
      `UPDATE tests
       SET name = $2, name_ar = $3, category_id = $4, method = $5,
           price = COALESCE(NULLIF(price, 0), $6),
           turnaround_hours = COALESCE(turnaround_hours, $7),
           is_active = true, updated_at = NOW()
       WHERE id = $1`,
      [
        test.rows[0].id,
        TEST.name,
        TEST.name_ar,
        categoryId,
        TEST.method,
        TEST.price,
        TEST.turnaround_hours,
      ]
    );
  } else {
    test = await query(
      `INSERT INTO tests (
         code, name, name_ar, category_id, price, method, turnaround_hours, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       RETURNING id`,
      [
        TEST.code,
        TEST.name,
        TEST.name_ar,
        categoryId,
        TEST.price,
        TEST.method,
        TEST.turnaround_hours,
      ]
    );
  }
  const testId = test.rows[0].id;

  for (const p of PARAMS) {
    const existing = await query(
      `SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2`,
      [testId, p.code]
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
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [testId, p.code, p.name, p.name_ar, p.unit, p.sort_order]
      );
    }
  }

  logger.info('BRU-ELISA catalog ensured', { testId });
  return { ok: true, testId };
};

if (require.main === module) {
  ensureBruElisaCatalog()
    .then(() => pool.end())
    .catch((err) => {
      logger.error('ensure-bru-elisa failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { ensureBruElisaCatalog, TEST, PARAMS };
