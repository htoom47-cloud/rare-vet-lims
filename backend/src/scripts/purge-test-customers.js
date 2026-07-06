/**
 * Purge test customers and ALL related data (animals, samples, results, reports, invoices).
 * Production use only with explicit IDs and --confirm after --dry-run review.
 *
 * Usage:
 *   cd backend
 *   node src/scripts/purge-test-customers.js --list --limit=30
 *   node src/scripts/purge-test-customers.js --ids=<uuid>,<uuid> --dry-run
 *   node src/scripts/purge-test-customers.js --ids=<uuid> --confirm
 *
 * Env: DATABASE_URL (production External URL + NODE_ENV=production + DATABASE_SSL_REJECT_UNAUTHORIZED=false from local)
 * Or run on Render Shell (recommended).
 */
require('dotenv').config();
const { pool } = require('../config/database');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {
    list: false,
    dryRun: true,
    confirm: false,
    ids: [],
    nameLike: null,
    limit: 50,
  };
  for (const arg of args) {
    if (arg === '--list') opts.list = true;
    else if (arg === '--confirm') { opts.confirm = true; opts.dryRun = false; }
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--ids=')) {
      opts.ids = arg.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--name-like=')) {
      opts.nameLike = arg.slice(12).trim();
    } else if (arg.startsWith('--limit=')) {
      opts.limit = Math.min(200, Math.max(1, parseInt(arg.slice(8), 10) || 50));
    }
  }
  return opts;
};

async function listRecent(client, limit) {
  const { rows } = await client.query(
    `SELECT c.id, c.full_name, c.mobile, c.created_at::date AS created,
            (SELECT COUNT(*)::int FROM animals a WHERE a.owner_id = c.id) AS animals,
            (SELECT COUNT(*)::int FROM samples s WHERE s.customer_id = c.id) AS samples,
            (SELECT COUNT(*)::int FROM invoices i WHERE i.customer_id = c.id) AS invoices
     FROM customers c
     ORDER BY c.created_at DESC
     LIMIT $1`,
    [limit]
  );
  console.log(`\nRecent customers (newest ${limit}):\n`);
  for (const r of rows) {
    console.log(`  ${r.id}`);
    console.log(`    ${r.full_name} | ${r.mobile} | ${r.created} | animals=${r.animals} samples=${r.samples} invoices=${r.invoices}`);
  }
  console.log('\nCopy UUIDs into: --ids=... --dry-run\n');
}

async function resolveCustomerIds(client, opts) {
  if (opts.ids.length) {
    const { rows } = await client.query(
      'SELECT id, full_name, mobile FROM customers WHERE id = ANY($1::uuid[])',
      [opts.ids]
    );
    if (rows.length !== opts.ids.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = opts.ids.filter((id) => !found.has(id));
      throw new Error(`Customer(s) not found: ${missing.join(', ')}`);
    }
    return rows;
  }
  if (opts.nameLike) {
    const { rows } = await client.query(
      `SELECT id, full_name, mobile FROM customers
       WHERE full_name ILIKE $1 OR full_name_ar ILIKE $1 OR mobile ILIKE $1
       ORDER BY created_at DESC`,
      [opts.nameLike]
    );
    if (!rows.length) throw new Error(`No customers match: ${opts.nameLike}`);
    return rows;
  }
  throw new Error('Provide --ids=uuid1,uuid2 or --name-like=%pattern% (use --list to find IDs)');
}

async function countForCustomer(client, customerId) {
  const q = async (sql, params) => (await client.query(sql, params)).rows[0].n;
  const sampleIds = (await client.query(
    'SELECT id FROM samples WHERE customer_id = $1', [customerId]
  )).rows.map((r) => r.id);

  const invoiceIds = (await client.query(
    'SELECT id FROM invoices WHERE customer_id = $1', [customerId]
  )).rows.map((r) => r.id);

  return {
    animals: await q('SELECT COUNT(*)::int AS n FROM animals WHERE owner_id = $1', [customerId]),
    samples: sampleIds.length,
    reports: sampleIds.length
      ? await q('SELECT COUNT(*)::int AS n FROM reports WHERE sample_id = ANY($1::uuid[])', [sampleIds])
      : 0,
    invoices: invoiceIds.length,
    payments: await q('SELECT COUNT(*)::int AS n FROM payments WHERE customer_id = $1', [customerId]),
    quotes: await q('SELECT COUNT(*)::int AS n FROM price_quotes WHERE customer_id = $1', [customerId]),
    notifications: await q(
      `SELECT COUNT(*)::int AS n FROM notification_queue
       WHERE metadata->>'customer_id' = $1 OR metadata->>'customerId' = $1`,
      [customerId]
    ),
    sampleIds,
    invoiceIds,
  };
}

async function purgeCustomer(client, customerId) {
  const { sampleIds, invoiceIds } = await countForCustomer(client, customerId);

  if (sampleIds.length) {
    await client.query('DELETE FROM device_messages WHERE sample_id = ANY($1::uuid[])', [sampleIds]);
    await client.query('DELETE FROM reports WHERE sample_id = ANY($1::uuid[])', [sampleIds]);
    await client.query(
      `DELETE FROM result_attachments ra
       USING results r
       JOIN sample_tests st ON st.id = r.sample_test_id
       WHERE ra.result_id = r.id AND st.sample_id = ANY($1::uuid[])`,
      [sampleIds]
    );
    await client.query(
      `DELETE FROM result_values rv
       USING results r
       JOIN sample_tests st ON st.id = r.sample_test_id
       WHERE rv.result_id = r.id AND st.sample_id = ANY($1::uuid[])`,
      [sampleIds]
    );
    await client.query(
      `DELETE FROM results r
       USING sample_tests st
       WHERE r.sample_test_id = st.id AND st.sample_id = ANY($1::uuid[])`,
      [sampleIds]
    );
    await client.query('DELETE FROM sample_tests WHERE sample_id = ANY($1::uuid[])', [sampleIds]);
    await client.query('DELETE FROM samples WHERE id = ANY($1::uuid[])', [sampleIds]);
  }

  if (invoiceIds.length) {
    await client.query(
      `DELETE FROM journal_lines jl
       USING journal_entries je
       WHERE jl.entry_id = je.id
         AND je.source_id = ANY($1::uuid[])
         AND je.source_type IN ('invoice', 'payment', 'refund')`,
      [invoiceIds]
    );
    await client.query(
      `DELETE FROM journal_entries
       WHERE source_id = ANY($1::uuid[]) AND source_type IN ('invoice', 'payment', 'refund')`,
      [invoiceIds]
    );
    await client.query(
      'DELETE FROM refunds WHERE invoice_id = ANY($1::uuid[])',
      [invoiceIds]
    );
  }

  await client.query('DELETE FROM payments WHERE customer_id = $1', [customerId]);
  await client.query('DELETE FROM invoices WHERE customer_id = $1', [customerId]);

  const quoteIds = (await client.query(
    'SELECT id FROM price_quotes WHERE customer_id = $1', [customerId]
  )).rows.map((r) => r.id);
  if (quoteIds.length) {
    await client.query('DELETE FROM price_quote_items WHERE quote_id = ANY($1::uuid[])', [quoteIds]);
    await client.query('DELETE FROM price_quotes WHERE id = ANY($1::uuid[])', [quoteIds]);
  }

  await client.query(
    `DELETE FROM notification_queue
     WHERE metadata->>'customer_id' = $1 OR metadata->>'customerId' = $1`,
    [customerId]
  );

  await client.query('DELETE FROM animals WHERE owner_id = $1', [customerId]);
  await client.query('DELETE FROM customers WHERE id = $1', [customerId]);
}

async function main() {
  const opts = parseArgs();
  const client = await pool.connect();

  try {
    if (opts.list) {
      await listRecent(client, opts.limit);
      return;
    }

    const customers = await resolveCustomerIds(client, opts);
    console.log(`\n=== Purge ${customers.length} customer(s) — ${opts.dryRun ? 'DRY RUN' : 'CONFIRMED DELETE'} ===\n`);

    for (const c of customers) {
      const counts = await countForCustomer(client, c.id);
      console.log(`${c.full_name} (${c.mobile})`);
      console.log(`  id=${c.id}`);
      console.log(`  animals=${counts.animals} samples=${counts.samples} reports=${counts.reports}`);
      console.log(`  invoices=${counts.invoices} payments=${counts.payments} quotes=${counts.quotes}`);
      console.log(`  notifications=${counts.notifications}`);
    }

    if (opts.dryRun) {
      console.log('\nNo data deleted (dry run).');
      console.log('To delete, re-run with --confirm (same --ids).\n');
      return;
    }

    if (!opts.confirm) {
      throw new Error('Refusing to delete without --confirm');
    }

    await client.query('BEGIN');
    for (const c of customers) {
      console.log(`\nDeleting ${c.full_name}...`);
      await purgeCustomer(client, c.id);
      console.log('  done');
    }
    await client.query('COMMIT');
    console.log('\n=== Purge complete ===\n');
    console.log('Note: PDF files in storage (reports/invoices) may remain as orphans — optional manual cleanup.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('\nFAILED:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
