/**
 * Idempotent: display labels for CHEM BUN as UR / Urea / اليوريا.
 * Updates name, name_ar, short_code, device_code only.
 * Does not change internal code, unit, reference ranges, results, or ingest mappings.
 *
 * Usage: node src/scripts/ensure-bun-urea-labels.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const logger = require('../config/logger');

const EN_NAME = 'Urea';
const AR_NAME = 'اليوريا';
const DISPLAY_CODE = 'UR';

async function main() {
  const result = await query(
    `UPDATE test_parameters
     SET name = $1,
         name_ar = $2,
         short_code = $3,
         device_code = $3
     WHERE UPPER(code) = 'BUN'
       AND (
         name IS DISTINCT FROM $1
         OR name_ar IS DISTINCT FROM $2
         OR short_code IS DISTINCT FROM $3
         OR device_code IS DISTINCT FROM $3
       )
     RETURNING id, code, name, name_ar, short_code, device_code`,
    [EN_NAME, AR_NAME, DISPLAY_CODE]
  );

  logger.info('ensure-bun-urea-labels', {
    updated: result.rowCount,
    rows: result.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      name_ar: r.name_ar,
      short_code: r.short_code,
      device_code: r.device_code,
    })),
  });
  console.log(
    `Updated ${result.rowCount} BUN parameter display label(s) → code ${DISPLAY_CODE}, ${EN_NAME} / ${AR_NAME}`
  );
}

main()
  .catch((err) => {
    logger.error('ensure-bun-urea-labels failed', { error: err.message });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
