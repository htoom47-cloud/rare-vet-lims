/**
 * Create missing CHEM-BASIC parameters used by DiaSys ingest.
 * Idempotent: inserts only codes that do not already exist.
 * Does not alter existing rows, devices, API keys, mappings, or reference ranges.
 *
 * Usage: cd backend && node src/scripts/ensure-diasys-chem-params.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { DIASYS_TEST_CODE, DIASYS_CHEM_PARAM_DEFS } = require('../utils/diasys-chem-map');

async function main() {
  const test = await query('SELECT id FROM tests WHERE code = $1 LIMIT 1', [DIASYS_TEST_CODE]);
  if (!test.rows[0]) {
    throw new Error(`${DIASYS_TEST_CODE} test not found — run seed first`);
  }
  const testId = test.rows[0].id;
  let created = 0;
  const skipped = [];

  for (const def of DIASYS_CHEM_PARAM_DEFS) {
    const existing = await query(
      `SELECT id FROM test_parameters
       WHERE test_id = $1 AND UPPER(code) = UPPER($2)
       LIMIT 1`,
      [testId, def.code]
    );
    if (existing.rows[0]) {
      skipped.push(def.code);
      continue;
    }

    await query(
      `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, value_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, 'numeric', 100)`,
      [testId, def.code, def.name, def.name_ar, def.unit]
    );
    created += 1;
    console.log(`Created CHEM-BASIC parameter: ${def.code}`);
  }

  console.log(`Done. created=${created} already_present=${skipped.length} (${skipped.join(', ')})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
