/**
 * Permanent (hard) deletion of lab records and related rows.
 * Used by trash permanent-delete and soft-delete expiry cron.
 */

const { syncCustomerArBalance } = require('./accounting.service');

const tableExists = async (client, name) => {
  const result = await client.query('SELECT to_regclass($1) AS reg', [`public.${name}`]);
  return Boolean(result.rows[0]?.reg);
};

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

/** Trash permanent-delete may remove issued credit notes (admin intent). */
const purgeCreditNotesByIds = async (client, noteIds) => {
  if (!noteIds.length) return;
  if (!(await tableExists(client, 'credit_notes'))) return;

  await deleteJournalsForSources(client, noteIds);

  const hasEvents = await tableExists(client, 'credit_note_events');
  try {
    if (hasEvents) await client.query('ALTER TABLE credit_note_events DISABLE TRIGGER USER');
    await client.query('ALTER TABLE credit_notes DISABLE TRIGGER USER');
    if (hasEvents) {
      await client.query(
        'DELETE FROM credit_note_events WHERE credit_note_id = ANY($1::uuid[])',
        [noteIds]
      );
    }
    await client.query('DELETE FROM credit_notes WHERE id = ANY($1::uuid[])', [noteIds]);
  } finally {
    try { await client.query('ALTER TABLE credit_notes ENABLE TRIGGER USER'); } catch (_) { /* ignore */ }
    if (hasEvents) {
      try { await client.query('ALTER TABLE credit_note_events ENABLE TRIGGER USER'); } catch (_) { /* ignore */ }
    }
  }
};

const purgeCreditNotesForInvoice = async (client, invoiceId) => {
  if (!(await tableExists(client, 'credit_notes'))) return;
  const notes = await client.query('SELECT id FROM credit_notes WHERE invoice_id = $1', [invoiceId]);
  await purgeCreditNotesByIds(client, notes.rows.map((r) => r.id));
};

const purgeCreditNotesForCustomer = async (client, customerId) => {
  if (!(await tableExists(client, 'credit_notes'))) return;
  const notes = await client.query('SELECT id FROM credit_notes WHERE customer_id = $1', [customerId]);
  await purgeCreditNotesByIds(client, notes.rows.map((r) => r.id));
};

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

async function hardPurgeInvoice(client, invoiceId) {
  await purgeCreditNotesForInvoice(client, invoiceId);

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
  await purgeCreditNotesForCustomer(client, customerId);

  if (await tableExists(client, 'customer_store_credit_entries')) {
    await client.query('DELETE FROM customer_store_credit_entries WHERE customer_id = $1', [customerId]);
  }
  if (await tableExists(client, 'customer_brucella_lists')) {
    await client.query('DELETE FROM customer_brucella_lists WHERE customer_id = $1', [customerId]);
  }

  // Clear optional staff/portal FKs that reference this customer without CASCADE.
  await client.query(
    'UPDATE samples SET supervising_veterinarian_id = NULL WHERE supervising_veterinarian_id = $1',
    [customerId]
  ).catch((err) => { if (err.code !== '42703') throw err; });
  for (const table of [
    'animal_vaccinations',
    'animal_breeding_events',
    'animal_births',
    'animal_herd_notes',
  ]) {
    if (await tableExists(client, table)) {
      await client.query(
        `UPDATE ${table} SET created_by_customer = NULL WHERE created_by_customer = $1`,
        [customerId]
      );
    }
  }
  if (await tableExists(client, 'portal_herd_delegates')) {
    await client.query(
      `UPDATE portal_herd_delegates SET granted_by_customer_id = NULL WHERE granted_by_customer_id = $1`,
      [customerId]
    );
  }

  const sampleIds = (await client.query(
    'SELECT id FROM samples WHERE customer_id = $1',
    [customerId]
  )).rows.map((r) => r.id);

  const invoiceIds = (await client.query(
    'SELECT id FROM invoices WHERE customer_id = $1',
    [customerId]
  )).rows.map((r) => r.id);

  // Delete invoices one-by-one so credit-note / payment cleanup stays consistent.
  for (const invoiceId of invoiceIds) {
    await hardPurgeInvoice(client, invoiceId);
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
