const { query } = require('../config/database');

const DEFAULT_ACCOUNTS = [
  { code: '1010', name: 'Cash', name_ar: 'النقد', type: 'asset' },
  { code: '1020', name: 'Bank', name_ar: 'البنك', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', name_ar: 'الذمم المدينة', type: 'asset' },
  { code: '2100', name: 'VAT Payable', name_ar: 'ضريبة القيمة المضافة', type: 'liability' },
  { code: '4100', name: 'Lab Revenue', name_ar: 'إيرادات المختبر', type: 'revenue' },
];

let accountsReady = false;

const ensureAccountsSeeded = async () => {
  if (accountsReady) return;
  for (const acc of DEFAULT_ACCOUNTS) {
    await query(
      `INSERT INTO ledger_accounts (code, name, name_ar, type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [acc.code, acc.name, acc.name_ar, acc.type]
    );
  }
  accountsReady = true;
};

const getAccountId = async (code) => {
  await ensureAccountsSeeded();
  const result = await query('SELECT id FROM ledger_accounts WHERE code = $1', [code]);
  return result.rows[0]?.id;
};

const createEntry = async (description, sourceType, sourceId, userId, lines) => {
  await ensureAccountsSeeded();
  const entry = await query(
    `INSERT INTO journal_entries (description, source_type, source_id, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [description, sourceType, sourceId, userId]
  );
  const entryId = entry.rows[0].id;
  for (const line of lines) {
    await query(
      `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
       VALUES ($1, $2, $3, $4)`,
      [entryId, line.accountId, line.debit || 0, line.credit || 0]
    );
  }
  return entryId;
};

const postInvoice = async (invoice, userId) => {
  const total = parseFloat(invoice.total);
  const tax = parseFloat(invoice.tax_amount || 0);
  const revenue = Math.max(total - tax, 0);
  if (total <= 0) return null;

  const [arId, revId, vatId] = await Promise.all([
    getAccountId('1100'),
    getAccountId('4100'),
    getAccountId('2100'),
  ]);

  const lines = [{ accountId: arId, debit: total, credit: 0 }];
  if (revenue > 0) lines.push({ accountId: revId, debit: 0, credit: revenue });
  if (tax > 0) lines.push({ accountId: vatId, debit: 0, credit: tax });

  return createEntry(
    `Invoice ${invoice.invoice_number}`,
    'invoice',
    invoice.id,
    userId,
    lines
  );
};

const postPayment = async (payment, invoice, userId) => {
  const amount = parseFloat(payment.amount);
  if (amount <= 0) return null;

  const cashCode = payment.method === 'bank_transfer' ? '1020' : '1010';
  const [cashId, arId] = await Promise.all([getAccountId(cashCode), getAccountId('1100')]);

  return createEntry(
    `Payment ${invoice.invoice_number} (${payment.method})`,
    'payment',
    payment.id,
    userId,
    [
      { accountId: cashId, debit: amount, credit: 0 },
      { accountId: arId, debit: 0, credit: amount },
    ]
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
  postInvoice,
  postPayment,
  listJournalEntries,
};
