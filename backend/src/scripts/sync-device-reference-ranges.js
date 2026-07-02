/**
 * Daily sync — extract Norma reference ranges from messages received in the last 24 hours.
 * Schedule: 2:00 AM AST (23:00 UTC) via Render cron.
 *
 * Usage: node src/scripts/sync-device-reference-ranges.js [hours]
 */
require('dotenv').config();
const { pool } = require('../config/database');
const deviceRefRanges = require('../services/device-reference-ranges.service');
const logger = require('../config/logger');

async function main() {
  const hours = parseInt(process.argv[2], 10) || 24;
  const summary = await deviceRefRanges.syncFromRecentMessages({ hours });

  console.log('\n=== Device reference range daily sync ===');
  console.log(`Messages processed: ${summary.messagesProcessed}`);
  console.log(`Inserted: ${summary.inserted} | Updated: ${summary.updated} | Skipped: ${summary.skipped}`);
  console.log(`Window: last ${summary.hours} hours\n`);

  if (summary.messagesProcessed === 0) {
    logger.warn('No Norma messages in sync window — run CBC on Norma to populate ranges');
  }
}

main()
  .catch((err) => {
    logger.error('sync-device-reference-ranges failed', { error: err.message });
    process.exit(1);
  })
  .finally(() => pool.end());
