/**
 * Force-sync lab phone/VAT from env into DB settings and clear PDF caches.
 * Usage: node src/scripts/sync-lab-contact.js
 */
require('dotenv').config();
const { pool } = require('../config/database');
const logger = require('../config/logger');
const env = require('../config/env');

async function main() {
  const client = await pool.connect();
  try {
    const contact = {
      phone: env.lab.phone,
      email: env.lab.email,
      vat_number: env.lab.vatNumber,
      vat: env.lab.vatNumber,
    };
    logger.info('Syncing lab contact', contact);

    for (const key of ['invoice_template', 'lab_info']) {
      const row = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
      let parsed = row.rows[0]?.value
        ? (typeof row.rows[0].value === 'object' ? JSON.parse(JSON.stringify(row.rows[0].value)) : JSON.parse(row.rows[0].value))
        : (key === 'invoice_template' ? { lab: {} } : {});

      if (key === 'invoice_template') {
        parsed.lab = { ...(parsed.lab || {}), ...contact };
      } else {
        parsed = { ...parsed, ...contact };
      }

      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(parsed)]
      );
    }

    const inv = await client.query('UPDATE invoices SET pdf_url = NULL WHERE pdf_url IS NOT NULL');
    const quotes = await client.query('UPDATE price_quotes SET pdf_url = NULL WHERE pdf_url IS NOT NULL');
    logger.info('Done', {
      invoices_cleared: inv.rowCount,
      quotes_cleared: quotes.rowCount,
      phone: env.lab.phone,
      vat: env.lab.vatNumber,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  logger.error('sync-lab-contact failed', { error: err.message });
  process.exit(1);
});
