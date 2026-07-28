/**
 * Idempotent: display labels for CHEM BUN as Urea / اليوريا.
 * Does not change code, unit, reference ranges, or results.
 *
 * Usage: node src/scripts/ensure-bun-urea-labels.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const logger = require('../config/logger');

const EN_NAME = 'Urea';
const AR_NAME = 'اليوريا';

async function main() {
  const result = await query(
    `UPDATE test_parameters
     SET name = $1,
         name_ar = $2
     WHERE UPPER(code) = 'BUN'
       AND (name IS DISTINCT FROM $1 OR name_ar IS DISTINCT FROM $2)
     RETURNING id, code, name, name_ar`,
    [EN_NAME, AR_NAME]
  );

  logger.info('ensure-bun-urea-labels', {
    updated: result.rowCount,
    rows: result.rows.map((r) => ({ id: r.id, code: r.code, name: r.name, name_ar: r.name_ar })),
  });
  console.log(`Updated ${result.rowCount} BUN parameter label(s) → ${EN_NAME} / ${AR_NAME}`);
}

main()
  .catch((err) => {
    logger.error('ensure-bun-urea-labels failed', { error: err.message });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
