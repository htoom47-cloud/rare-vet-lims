/**
 * Sync CBC-FULL parameters to match Norma iVet-5 panel (symbols, order, units).
 * Usage: node src/scripts/sync-cbc-params.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const { NORMA_CBC_PANEL, NORMA_CBC_PANEL_CODES } = require('../utils/norma-cbc-panel');
const logger = require('../config/logger');

async function main() {
  const test = await query("SELECT id FROM tests WHERE code = 'CBC-FULL' LIMIT 1");
  const testId = test.rows[0]?.id;
  if (!testId) {
    logger.error('CBC-FULL test not found — run seed first');
    process.exit(1);
  }

  let added = 0;
  let updated = 0;
  for (const p of NORMA_CBC_PANEL) {
    const existing = await query(
      'SELECT id FROM test_parameters WHERE test_id = $1 AND code = $2',
      [testId, p.code]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE test_parameters SET sort_order = $1, name = $2, name_ar = $3, unit = $4, is_active = true WHERE id = $5`,
        [p.displayOrder, p.symbol, p.name_ar, p.unit, existing.rows[0].id]
      );
      updated += 1;
    } else {
      await query(
        `INSERT INTO test_parameters (test_id, code, name, name_ar, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testId, p.code, p.symbol, p.name_ar, p.unit, p.displayOrder]
      );
      added += 1;
    }
  }

  const allParams = await query(
    'SELECT id, code FROM test_parameters WHERE test_id = $1',
    [testId]
  );
  let deactivated = 0;
  for (const row of allParams.rows) {
    if (!NORMA_CBC_PANEL_CODES.has(row.code)) {
      await query('UPDATE test_parameters SET is_active = false WHERE id = $1', [row.id]);
      deactivated += 1;
    }
  }

  logger.info(`Norma CBC panel synced: ${added} added, ${updated} updated (${NORMA_CBC_PANEL.length} parameters), ${deactivated} deactivated`);
  logger.info('Run: npm run sync-norma-refs — to sync reference ranges');
  await pool.end();
}

main().catch((err) => {
  logger.error('Sync failed', { error: err.message });
  process.exit(1);
});
