/**
 * Permanent (hard) deletion of lab records and related rows.
 * Used by purge scripts and soft-delete expiry cron.
 */

const { AppError } = require('../middleware/errorHandler');
const { syncCustomerArBalance } = require('./accounting.service');

async function hardPurgeSample(client, sampleId) {
  // invoices.sample_id FK — unlink before deleting sample
  await client.query('UPDATE invoices SET sample_id = NULL WHERE sample_id = $1', [sampleId]);
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

const deleteJournalsForSources = async (client, sourceIds) => {
  if (!sourceIds.length) return;
  await client.query(
    `DELETE FROM journal_lines
     WHERE entry_id IN (SELECT id FROM journal_entries WHERE source_id = ANY($1::uuid[]))`,
    [sourceIds]
  );
  await client.query(
    `DELETE FROM journal_entries WHERE source_id = ANY($1::uuid[])`,
    [sourceIds]
  );
};

async function assertNoCreditNotes(client, invoiceId) {
  try {
    const notes = await client.query(
      `SELECT credit_note_number, status FROM credit_notes WHERE invoice_id = $1`,
      [invoiceId]
    );
    if (notes.rows.length) {
      const list = notes.rows.map((n) => n.credit_note_number).join(', ');
      throw new AppError(
        `Cannot permanently delete this invoice while credit notes exist (${list})`,
        409,
        'HAS_CREDIT_NOTES'
      );
    }
  } catch (err) {
    if (err.code === '42P01') return;
    throw err;
  }
}

async function hardPurgeInvoice(client, invoiceId) {
  await assertNoCreditNotes(client, invoiceId);

  const customerRow = await client.query(
    'SELECT customer_id FROM invoices WHERE id = $1',
    [invoiceId]
  );
  const customerId = customerRow.rows[0]?.customer_id || null;
  const paymentRows = await client.query('SELECT id FROM payments WHERE invoice_id = $1', [invoiceId]);
  const paymentIds = paymentRows.rows.map((r) => r.id);

  let refundRows;
  if (paymentIds.length) {
    refundRows = await client.query(
      `SELECT id FROM refunds WHERE invoice_id = $1 OR payment_id = ANY($2::uuid[])`,
      [invoiceId, paymentIds]
    );
  } else {
    refundRows = await client.query(
      'SELECT id FROM refunds WHERE invoice_id = $1',
      [invoiceId]
    );
  }
  const refundIds = refundRows.rows.map((r) => r.id);
  const sourceIds = [invoiceId, ...paymentIds, ...refundIds];

  await deleteJournalsForSources(client, sourceIds);

  if (paymentIds.length) {
    await client.query(
      'DELETE FROM refunds WHERE invoice_id = $1 OR payment_id = ANY($2::uuid[])',
      [invoiceId, paymentIds]
    );
  } else {
    await client.query('DELETE FROM refunds WHERE invoice_id = $1', [invoiceId]);
  }
  await client.query('DELETE FROM payments WHERE invoice_id = $1', [invoiceId]);
  await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
  await client.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);

  if (customerId) {
    const still = await client.query('SELECT id FROM customers WHERE id = $1', [customerId]);
    if (still.rows[0]) await syncCustomerArBalance(customerId, client);
  }
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

  // Delete invoices BEFORE samples — invoices.sample_id FK blocks sample delete
  if (invoiceIds.length) {
    const paymentIds = (await client.query(
      'SELECT id FROM payments WHERE invoice_id = ANY($1::uuid[])',
      [invoiceIds]
    )).rows.map((r) => r.id);
    const refundIds = (await client.query(
      paymentIds.length
        ? 'SELECT id FROM refunds WHERE invoice_id = ANY($1::uuid[]) OR payment_id = ANY($2::uuid[])'
        : 'SELECT id FROM refunds WHERE invoice_id = ANY($1::uuid[])',
      paymentIds.length ? [invoiceIds, paymentIds] : [invoiceIds]
    )).rows.map((r) => r.id);
    const sourceIds = [...invoiceIds, ...paymentIds, ...refundIds];

    await deleteJournalsForSources(client, sourceIds);
    if (paymentIds.length) {
      await client.query(
        'DELETE FROM refunds WHERE invoice_id = ANY($1::uuid[]) OR payment_id = ANY($2::uuid[])',
        [invoiceIds, paymentIds]
      );
    } else {
      await client.query('DELETE FROM refunds WHERE invoice_id = ANY($1::uuid[])', [invoiceIds]);
    }
    await client.query('DELETE FROM payments WHERE invoice_id = ANY($1::uuid[])', [invoiceIds]);
    await client.query('DELETE FROM invoice_items WHERE invoice_id = ANY($1::uuid[])', [invoiceIds]);
    await client.query('DELETE FROM invoices WHERE id = ANY($1::uuid[])', [invoiceIds]);
  }

  await client.query('DELETE FROM payments WHERE customer_id = $1', [customerId]);

  if (sampleIds.length) {
    await client.query('UPDATE invoices SET sample_id = NULL WHERE sample_id = ANY($1::uuid[])', [sampleIds]);
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
