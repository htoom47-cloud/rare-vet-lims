/**
 * Sync Norma iVet CBC reference ranges into test_reference_ranges.
 * Usage: node src/scripts/sync-norma-references.js [animal_type]
 * Default animal_type: camel
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const logger = require('../config/logger');

const DEFAULT_TEST_CODE = 'CBC-FULL';

async function main() {
  const animalType = (process.argv[2] || 'camel').toLowerCase();
  const ranges = NORMA_CBC_REFERENCES[animalType];
  if (!ranges) {
    logger.error(`No Norma reference table for animal type: ${animalType}`);
    process.exit(1);
  }

  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [DEFAULT_TEST_CODE]);
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.error('CBC-FULL test not found — run seed first');
    process.exit(1);
  }

  const params = await query(
    'SELECT id, code, unit FROM test_parameters WHERE test_id = $1',
    [testId]
  );
  const byCode = Object.fromEntries(params.rows.map((p) => [p.code, p]));

  let synced = 0;
  let missing = 0;
  for (const [code, ref] of Object.entries(ranges)) {
    const param = byCode[code];
    if (!param) {
      missing += 1;
      continue;
    }
    await upsertReferenceRange({
      parameterId: param.id,
      animalType,
      min: ref.min,
      max: ref.max,
      criticalLow: ref.crit_low,
      criticalHigh: ref.crit_high,
      unit: param.unit,
      source: 'norma-profile',
    });
    synced += 1;
  }

  logger.info(`Norma references synced for ${animalType}: ${synced} parameters (${missing} codes not in DB)`);
  await pool.end();
}

main().catch((err) => {
  logger.error('Sync Norma references failed', { error: err.message });
  process.exit(1);
});
