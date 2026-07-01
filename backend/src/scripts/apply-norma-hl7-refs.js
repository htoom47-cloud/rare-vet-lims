/**
 * Apply reference ranges from the latest Norma HL7 import into test_reference_ranges.
 * Use after changing reference profiles on the Norma device.
 *
 * Usage: node src/scripts/apply-norma-hl7-refs.js [animal_type]
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { syncFromParsedResults } = require('../services/reference-ranges.service');
const logger = require('../config/logger');

async function main() {
  const animalType = (process.argv[2] || 'camel').toLowerCase();

  const msg = await query(
    `SELECT dm.parsed_data, dm.created_at
     FROM device_messages dm
     JOIN device_integrations di ON di.id = dm.device_id
     WHERE di.name ILIKE '%norma%'
       AND dm.status = 'imported'
       AND dm.parsed_data->'results' IS NOT NULL
     ORDER BY dm.created_at DESC
     LIMIT 1`
  );

  const row = msg.rows[0];
  if (!row) {
    logger.error('No imported Norma message with results found');
    process.exit(1);
  }

  const parsed = typeof row.parsed_data === 'string' ? JSON.parse(row.parsed_data) : row.parsed_data;
  const results = parsed.results || [];
  const withRefs = results.filter((r) => r.referenceMin != null && r.referenceMax != null);

  if (!withRefs.length) {
    logger.error('Latest Norma message has no OBX-7 reference ranges — run a CBC on Norma first');
    process.exit(1);
  }

  const sync = await syncFromParsedResults({ results, testCode: 'CBC-FULL', animalType });
  logger.info(`Applied HL7 reference ranges from ${row.created_at.toISOString()}: ${sync.updated} updated, ${sync.skipped} skipped (${withRefs.length} in message)`);
  await pool.end();
}

main().catch((err) => {
  logger.error('apply-norma-hl7-refs failed', { error: err.message });
  process.exit(1);
});
