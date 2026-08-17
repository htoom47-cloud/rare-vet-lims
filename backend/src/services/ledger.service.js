const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const {
  journalIsBalanced,
  buildInvoiceJournalLines,
  buildPaymentJournalLines,
  buildRefundJournalLines,
  buildCreditNoteJournalLines,
} = require('../utils/invoice-settlement');

const DEFAULT_ACCOUNTS = [
  { code: '1010', name: 'Cash', name_ar: 'النقد', type: 'asset' },
  { code: '1020', name: 'Bank', name_ar: 'البنك', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', name_ar: 'الذمم المدينة', type: 'asset' },
  { code: '1170', name: 'Recoverable Input VAT', name_ar: 'ضريبة المدخلات القابلة للاسترداد', type: 'asset' },
  { code: '1200', name: 'Inventory', name_ar: 'المخزون', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', name_ar: 'الذمم الدائنة', type: 'liability' },
  { code: '2100', name: 'VAT Payable', name_ar: 'ضريبة القيمة المضافة', type: 'liability' },
  { code: '4100', name: 'Lab Revenue', name_ar: 'إيرادات المختبر', type: 'revenue' },
  { code: '5100', name: 'Direct purchase expense', name_ar: 'مصروف مشتريات مباشر', type: 'expense' },
];

let accountsReady = false;

const exec = (client, text, params) => (client ? client.query(text, params) : query(text, params));

const ensureAccountsSeeded = async (client) => {
  if (accountsReady && !client) return;
  for (const acc of DEFAULT_ACCOUNTS) {
    await exec(
      client,
      `INSERT INTO ledger_accounts (code, name, name_ar, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [acc.code, acc.name, acc.name_ar, acc.type]
    );
  }
  accountsReady = true;
};

const getAccountId = async (code, client) => {
  await ensureAccountsSeeded(client);
  const result = await exec(client, 'SELECT id FROM ledger_accounts WHERE code = $1', [code]);
  const id = result.rows[0]?.id;
  if (!id) throw new AppError(`Ledger account ${code} is missing`, 500, 'LEDGER_ACCOUNT_MISSING');
  return id;
};

const assertNoDuplicateJournal = async (client, sourceType, sourceId) => {
  const existing = await exec(
    client,
    `SELECT id FROM journal_entries WHERE source_type = $1 AND source_id = $2 LIMIT 1`,
    [sourceType, sourceId]
  );
  if (existing.rows[0]) {
    throw new AppError('Journal already posted for this source', 409, 'DUPLICATE_JOURNAL');
  }
};

const linesUseIntegerHalalas = (lines) => lines.every((line) => (
  Number.isInteger(line.debit_halalas) && Number.isInteger(line.credit_halalas)
));

const createEntry = async (description, sourceType, sourceId, userId, lines, client, options = {}) => {
  const integerMode = linesUseIntegerHalalas(lines);
  if (integerMode) {
    const debit = lines.reduce((sum, line) => sum + line.debit_halalas, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit_halalas, 0);
    if (debit !== credit || debit <= 0) {
      throw new AppError('Unbalanced journal entry', 500, 'UNBALANCED_JOURNAL');
    }
  } else if (!journalIsBalanced(lines)) {
    throw new AppError('Unbalanced journal entry', 500, 'UNBALANCED_JOURNAL');
  }
  if (lines.some((line) => !line.accountId)) {
    throw new AppError('Ledger account missing', 500, 'LEDGER_ACCOUNT_MISSING');
  }

  await ensureAccountsSeeded(client);
  await assertNoDuplicateJournal(client, sourceType, sourceId);

  const entry = await exec(
    client,
    `INSERT INTO journal_entries (description, source_type, source_id, created_by, entry_date)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW())) RETURNING id`,
    [description, sourceType, sourceId, userId, options.entryDate || null]
  );
  const entryId = entry.rows[0].id;
  for (const line of lines) {
    if (integerMode) {
      await exec(
        client,
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
         VALUES ($1, $2, ($3::numeric / 100), ($4::numeric / 100))`,
        [entryId, line.accountId, line.debit_halalas, line.credit_halalas]
      );
    } else {
      await exec(
        client,
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4)`,
        [entryId, line.accountId, line.debit || 0, line.credit || 0]
      );
    }
  }
  return entryId;
};

const postInvoice = async (invoice, userId, client) => {
  const arId = await getAccountId('1100', client);
  const revId = await getAccountId('4100', client);
  const vatId = await getAccountId('2100', client);
  const lines = buildInvoiceJournalLines({
    total: invoice.total,
    tax_amount: invoice.tax_amount,
    arId,
    revId,
    vatId,
  });
  if (!lines.length) return null;

  return createEntry(
    `Invoice ${invoice.invoice_number}`,
    'invoice',
    invoice.id,
    userId,
    lines,
    client
  );
};

const postPayment = async (payment, invoice, userId, client) => {
  const cashCode = payment.method === 'bank_transfer' ? '1020' : '1010';
  const cashId = await getAccountId(cashCode, client);
  const arId = await getAccountId('1100', client);
  const lines = buildPaymentJournalLines({ amount: payment.amount, cashId, arId });
  if (!lines.length) return null;

  return createEntry(
    `Payment ${invoice.invoice_number} (${payment.method})`,
    'payment',
    payment.id,
    userId,
    lines,
    client
  );
};

const postRefund = async (refund, invoice, userId, client, method) => {
  if (!method) {
    throw new AppError('Refund journal requires the original payment method', 400, 'PAYMENT_METHOD_REQUIRED');
  }
  const cashCode = method === 'bank_transfer' ? '1020' : '1010';
  const cashId = await getAccountId(cashCode, client);
  const arId = await getAccountId('1100', client);
  const lines = buildRefundJournalLines({ amount: refund.amount, cashId, arId });
  if (!lines.length) return null;

  return createEntry(
    `Refund ${invoice.invoice_number} (${method})`,
    'refund',
    refund.id,
    userId,
    lines,
    client,
    { entryDate: refund.created_at || new Date() }
  );
};

const postCreditNote = async (note, invoice, userId, client) => {
  const arId = await getAccountId('1100', client);
  const revId = await getAccountId('4100', client);
  const vatId = await getAccountId('2100', client);
  const lines = buildCreditNoteJournalLines({
    total: note.total,
    tax_amount: note.tax_amount,
    arId,
    revId,
    vatId,
  });
  if (!lines.length) return null;

  return createEntry(
    `Credit note ${note.credit_note_number} for ${invoice.invoice_number}`,
    'credit_note',
    note.id,
    userId,
    lines,
    client
  );
};

const listJournalEntries = async (limit = 50) => {
  await ensureAccountsSeeded();
  const result = await query(
    `SELECT je.id, je.entry_date, je.description, je.source_type, je.source_id,
            u.full_name AS created_by_name,
            COALESCE(SUM(jl.debit), 0) AS total_debit
     FROM journal_entries je
     LEFT JOIN users u ON je.created_by = u.id
     LEFT JOIN journal_lines jl ON jl.entry_id = je.id
     GROUP BY je.id, u.full_name
     ORDER BY je.entry_date DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

module.exports = {
  ensureAccountsSeeded,
  getAccountId,
  postInvoice,
  postPayment,
  postRefund,
  postCreditNote,
  createEntry,
  listJournalEntries,
};
