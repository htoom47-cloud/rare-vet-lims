/**
 * Delete all device_reference_ranges rows (one-time purge of Norma-imported ranges).
 * Usage: node src/scripts/clear-device-reference-ranges.js
 */
require('dotenv').config();
const { pool } = require('../config/database');
const deviceRefRanges = require('../services/device-reference-ranges.service');

async function main() {
  const result = await deviceRefRanges.deleteAll();
  console.log(`\nDeleted ${result.deleted} device reference range(s).\n`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
