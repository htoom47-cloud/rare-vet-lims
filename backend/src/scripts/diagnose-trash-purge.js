/**
 * Diagnose soft-delete trash purge issues (run on Render Shell).
 *   cd backend && node src/scripts/diagnose-trash-purge.js
 */
require('dotenv').config();
const { query, pool } = require('../config/database');
const env = require('../config/env');
const { hardPurgeInvoice } = require('../services/data-purge.service');
const { getClient } = require('../config/database');

async function main() {
  console.log('\n=== Trash purge diagnosis ===\n');
  console.log(`SOFT_DELETE_ENABLED=${env.softDelete?.enabled}`);
  console.log(`retentionHours=${env.softDelete?.retentionHours ?? 48}`);

  const invoices = await query(
    `SELECT i.id, i.invoice_number, i.deleted_at, i.purge_after,
            (i.purge_after <= NOW()) AS expired,
            c.deleted_at AS customer_deleted_at,
            (SELECT COUNT(*)::int FROM payments p WHERE p.invoice_id = i.id) AS payments,
            (SELECT COUNT(*)::int FROM refunds r WHERE r.invoice_id = i.id) AS refunds,
            (SELECT COUNT(*)::int FROM journal_entries je
              WHERE je.source_id = i.id
                 OR je.source_id IN (SELECT id FROM payments WHERE invoice_id = i.id)
                 OR je.source_id IN (SELECT id FROM refunds WHERE invoice_id = i.id)
            ) AS journal_rows
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.deleted_at IS NOT NULL
     ORDER BY i.deleted_at DESC
     LIMIT 30`
  );

  console.log(`\nSoft-deleted invoices: ${invoices.rows.length}`);
  for (const row of invoices.rows) {
    console.log(
      `  ${row.invoice_number} expired=${row.expired} payments=${row.payments} refunds=${row.refunds} journal=${row.journal_rows} customer_deleted=${Boolean(row.customer_deleted_at)}`
    );
  }

  const dry = process.argv.includes('--try-one');
  if (dry && invoices.rows[0]) {
    const target = invoices.rows.find((r) => r.expired) || invoices.rows[0];
    console.log(`\nTrying hardPurgeInvoice on ${target.invoice_number} (${target.id})...`);
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await hardPurgeInvoice(client, target.id);
      await client.query('ROLLBACK');
      console.log('OK — hard purge would succeed (rolled back dry-run)');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('FAIL —', err.message);
      console.error(err.detail || '');
    } finally {
      client.release();
    }
  } else {
    console.log('\nTip: add --try-one to dry-run hard purge on first expired invoice (rolled back).');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
