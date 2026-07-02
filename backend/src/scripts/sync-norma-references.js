/**
 * Sync Norma iVet CBC reference ranges into test_reference_ranges.
 * Usage: node src/scripts/sync-norma-references.js [animal_type] [--force] [--all]
 * Default animal_type: camel
 * Without --force: only inserts missing ranges (preserves HL7-learned values from device).
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { NORMA_CBC_REFERENCES } = require('../utils/norma-cbc-references');
const { upsertReferenceRange } = require('../services/reference-ranges.service');
const { ANIMAL_TYPE_CODES } = require('../constants/animal-types');
const logger = require('../config/logger');

const DEFAULT_TEST_CODE = 'CBC-FULL';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const syncAll = args.includes('--all');
  const singleType = args.find((a) => !a.startsWith('--'))?.toLowerCase();
  const types = syncAll
    ? ANIMAL_TYPE_CODES.filter((t) => t !== 'other' && NORMA_CBC_REFERENCES[t])
    : [singleType || 'camel'];

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

  for (const animalType of types) {
    const ranges = NORMA_CBC_REFERENCES[animalType];
    if (!ranges) {
      logger.warn(`No Norma reference table for animal type: ${animalType}`);
      continue;
    }

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
        onlyIfMissing: !force,
      });
      synced += 1;
    }

    logger.info(`Norma references synced for ${animalType}: ${synced} parameters (${missing} codes not in DB)${force ? ' [force overwrite]' : ' [missing only]'}`);
  }

  await pool.end();
}

main().catch((err) => {
  logger.error('Sync Norma references failed', { error: err.message });
  process.exit(1);
});
