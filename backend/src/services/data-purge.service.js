/**
 * Permanent (hard) deletion of lab records and related rows.
 * Used by purge scripts and soft-delete expiry cron.
 */

async function hardPurgeSample(client, sampleId) {
  await client.query('DELETE FROM device_messages WHERE sample_id = $1', [sampleId]);
  await client.query('DELETE FROM reports WHERE sample_id = $1', [sampleId]);
  await client.query(
    `DELETE FROM result_attachments ra
     USING results r
     JOIN sample_tests st ON st.id = r.sample_test_id
     WHERE ra.result_id = r.id AND st.sample_id = $1`,
    [sampleId]
  );
  await client.query(
    `DELETE FROM result_values rv
     USING results r
     JOIN sample_tests st ON st.id = r.sample_test_id
     WHERE rv.result_id = r.id AND st.sample_id = $1`,
    [sampleId]
  );
  await client.query(
    `DELETE FROM results r
     USING sample_tests st
     WHERE r.sample_test_id = st.id AND st.sample_id = $1`,
    [sampleId]
  );
  await client.query('DELETE FROM sample_tests WHERE sample_id = $1', [sampleId]);
  await client.query('DELETE FROM samples WHERE id = $1', [sampleId]);
}

async function hardPurgeInvoice(client, invoiceId) {
  const invoiceIds = [invoiceId];
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
  await client.query('DELETE FROM refunds WHERE invoice_id = $1', [invoiceId]);
  await client.query('DELETE FROM payments WHERE invoice_id = $1', [invoiceId]);
  await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
  await client.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
}

async function hardPurgeReport(client, reportId) {
  await client.query('DELETE FROM reports WHERE id = $1', [reportId]);
}

async function hardPurgeCustomer(client, customerId) {
  const sampleIds = (await client.query(
    'SELECT id FROM samples WHERE customer_id = $1',
    [customerId]
  )).rows.map((r) => r.id);

  const invoiceIds = (await client.query(
    'SELECT id FROM invoices WHERE customer_id = $1',
    [customerId]
  )).rows.map((r) => r.id);

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
    await client.query('DELETE FROM refunds WHERE invoice_id = ANY($1::uuid[])', [invoiceIds]);
  }

  await client.query('DELETE FROM payments WHERE customer_id = $1', [customerId]);
  await client.query('DELETE FROM invoices WHERE customer_id = $1', [customerId]);

  const quoteIds = (await client.query(
    'SELECT id FROM price_quotes WHERE customer_id = $1',
    [customerId]
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

module.exports = {
  hardPurgeSample,
  hardPurgeInvoice,
  hardPurgeReport,
  hardPurgeCustomer,
};
