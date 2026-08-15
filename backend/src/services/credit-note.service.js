/**
 * Credit notes — post-issue settlement only.
 * Not ZATCA-ready: line items, XML, and cryptographic signing are a later phase.
 * Do not treat issued credit notes as e-invoices / e-credit-notes for ZATCA reporting.
 */
const { getClient, query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateCode } = require('../utils/helpers');
const { uuidv4 } = require('../utils/uuid');
const { notDeleted } = require('../utils/soft-delete-sql');
const { logBillingAudit } = require('../utils/billing-audit');
const { allocateCreditNote, afterSqlErrorInTransaction } = require('../utils/invoice-settlement');
const { creditNotesTableExists } = require('../utils/credit-notes-schema');
const ledger = require('./ledger.service');
const { assertDayOpen } = require('./daily-closing.service');
const { syncCustomerArBalance } = require('./accounting.service');
const { labDay } = require('../utils/accounting-time');

const asExecutor = (client) => client || { query };

const unavailableError = () => new AppError(
  'Credit notes are not installed. Apply the proposed credit_notes migration first.',
  503,
  'CREDIT_NOTES_UNAVAILABLE'
);

const assertCreditNotesAvailable = async (executor) => {
  if (!(await creditNotesTableExists(executor))) {
    throw unavailableError();
  }
};

const sumIssuedCreditNotes = async (client, invoiceId) => {
  if (!(await creditNotesTableExists(client))) return 0;
  const result = await asExecutor(client).query(
    `SELECT COALESCE(SUM(total), 0) AS n
     FROM credit_notes
     WHERE invoice_id = $1 AND status = 'issued'`,
    [invoiceId]
  );
  return result.rows[0].n;
};

const listCreditNotesForInvoice = async (client, invoiceId) => {
  if (!(await creditNotesTableExists(client))) return [];
  const result = await asExecutor(client).query(
    `SELECT cn.*, u.full_name AS created_by_name
     FROM credit_notes cn
     LEFT JOIN users u ON cn.created_by = u.id
     WHERE cn.invoice_id = $1
     ORDER BY cn.created_at DESC`,
    [invoiceId]
  );
  return result.rows;
};

const listCreditNotes = async (invoiceId) => listCreditNotesForInvoice(null, invoiceId);

const createCreditNote = async (data, userId, req = null, options = {}) => {
  await assertCreditNotesAvailable(options.client);

  const run = async (client) => {
    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND ${notDeleted()} FOR UPDATE`,
      [data.invoice_id]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (['cancelled', 'refunded'].includes(invoice.status)) {
      throw new AppError('Cannot credit cancelled or refunded invoice', 400, 'INVALID_STATUS');
    }

    await assertDayOpen(labDay(), client);

    const priorCredits = await sumIssuedCreditNotes(client, data.invoice_id);
    const allocated = allocateCreditNote({
      invoiceTotal: invoice.total,
      invoiceTax: invoice.tax_amount,
      priorCredits,
      requestedTotal: data.total,
    });
    if (!allocated.ok) {
      throw new AppError(allocated.message, 400, allocated.code);
    }

    const creditNoteId = uuidv4();
    const creditNoteNumber = generateCode('CN');
    const inserted = await client.query(
      `INSERT INTO credit_notes (
         id, credit_note_number, invoice_id, customer_id, reason,
         subtotal, tax_amount, total, status, posted_at, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'issued', NOW(), $9)
       RETURNING *`,
      [
        creditNoteId,
        creditNoteNumber,
        invoice.id,
        invoice.customer_id,
        data.reason,
        allocated.subtotal,
        allocated.tax_amount,
        allocated.total,
        userId,
      ]
    );

    const note = inserted.rows[0];

    await client.query(
      `INSERT INTO credit_note_events (id, credit_note_id, action, actor_id, details)
       VALUES ($1, $2, 'issued', $3, $4)`,
      [
        uuidv4(),
        note.id,
        userId,
        JSON.stringify({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          reason: data.reason,
          subtotal: allocated.subtotal,
          tax_amount: allocated.tax_amount,
          total: allocated.total,
        }),
      ]
    );

    await ledger.postCreditNote(note, invoice, userId, client);
    await syncCustomerArBalance(invoice.customer_id, client);
    await logBillingAudit({
      userId,
      action: 'create_credit_note',
      entityType: 'credit_note',
      entityId: note.id,
      newValues: {
        credit_note_number: note.credit_note_number,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        reason: data.reason,
        subtotal: allocated.subtotal,
        tax_amount: allocated.tax_amount,
        total: allocated.total,
        status: 'issued',
        zatca_ready: false,
      },
      req,
      client,
      required: true,
    });
    return note;
  };

  if (options.client) {
    try {
      return await run(options.client);
    } catch (err) {
      const decision = afterSqlErrorInTransaction(err);
      if (err.code === '42P01' || decision.code === 'CREDIT_NOTES_UNAVAILABLE') {
        throw unavailableError();
      }
      throw err;
    }
  }

  const client = await getClient();
  let committed = false;
  try {
    await client.query('BEGIN');
    const note = await run(client);
    await client.query('COMMIT');
    committed = true;
    return note;
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    const decision = afterSqlErrorInTransaction(err);
    if (err.code === '42P01' || decision.code === 'CREDIT_NOTES_UNAVAILABLE') {
      throw unavailableError();
    }
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  createCreditNote,
  listCreditNotes,
  listCreditNotesForInvoice,
  sumIssuedCreditNotes,
  assertCreditNotesAvailable,
};
