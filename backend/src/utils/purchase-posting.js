const { asIntegerHalalas, sarTextFromHalalas } = require('./money');
const { AppError } = require('../middleware/errorHandler');

const PURCHASE_LEDGER_ACCOUNTS = [
  { code: '1200', name: 'Inventory', name_ar: 'المخزون', type: 'asset' },
  { code: '1170', name: 'Recoverable Input VAT', name_ar: 'ضريبة المدخلات القابلة للاسترداد', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', name_ar: 'الذمم الدائنة', type: 'liability' },
  { code: '5100', name: 'Direct purchase expense', name_ar: 'مصروف مشتريات مباشر', type: 'expense' },
];

const CREDIT_ACCOUNT_BY_METHOD = {
  cash: '1010',
  bank_transfer: '1020',
  credit: '2000',
  other: '2000',
};

const SALES_VAT_PAYABLE_CODE = '2100';
const RECOVERABLE_VAT_POLICY = 'stored_invoice_vat_halalas_only';

const creditAccountCode = (paymentMethod) => CREDIT_ACCOUNT_BY_METHOD[paymentMethod] || CREDIT_ACCOUNT_BY_METHOD.other;

const integerHalalas = (value) => {
  try {
    return asIntegerHalalas(value);
  } catch (err) {
    throw new AppError('Amount must be integer halalas', 500, 'HALALA_NOT_INTEGER');
  }
};

const debitLine = (accountId, halalas, role) => ({
  accountId,
  debit_halalas: halalas,
  credit_halalas: 0,
  debit: sarTextFromHalalas(halalas),
  credit: sarTextFromHalalas(0),
  halalas,
  role,
});

const creditLine = (accountId, halalas, role) => ({
  accountId,
  debit_halalas: 0,
  credit_halalas: halalas,
  debit: sarTextFromHalalas(0),
  credit: sarTextFromHalalas(halalas),
  halalas,
  role,
});

const sumHalalas = (items, predicate) => items.reduce((sum, item) => (
  predicate(item) ? sum + integerHalalas(item.line_net_halalas || 0) : sum
), 0);

const groupExpenseHalalas = (items) => {
  const map = new Map();
  for (const item of items) {
    if (item.destination !== 'expense') continue;
    const id = item.expense_account_id;
    map.set(id, (map.get(id) || 0) + integerHalalas(item.line_net_halalas || 0));
  }
  return map;
};

const assertStoredTotals = (invoice, items) => {
  const lineNets = items.reduce((sum, item) => sum + integerHalalas(item.line_net_halalas || 0), 0);
  const vat = integerHalalas(invoice.vat_halalas || 0);
  const total = integerHalalas(invoice.total_halalas || 0);
  const subtotal = integerHalalas(invoice.subtotal_halalas || 0);
  const discount = integerHalalas(invoice.discount_halalas || 0);
  if (lineNets !== subtotal - discount) {
    throw new AppError(
      'Stored purchase line nets do not match subtotal minus discount',
      409,
      'PURCHASE_NETS_MISMATCH'
    );
  }
  if (lineNets + vat !== total) {
    throw new AppError(
      'Stored purchase totals do not match line nets plus VAT',
      409,
      'PURCHASE_TOTALS_MISMATCH'
    );
  }
};

const buildPurchaseJournalLines = ({
  invoice,
  items,
  inventoryAccountId,
  inputVatAccountId,
  creditAccountId,
  expenseAccountIds = {},
}) => {
  assertStoredTotals(invoice, items);
  const inventoryHalalas = sumHalalas(items, (item) => item.destination === 'inventory');
  const expenseByAccount = groupExpenseHalalas(items);
  const vatHalalas = integerHalalas(invoice.vat_halalas || 0);
  const totalHalalas = integerHalalas(invoice.total_halalas || 0);
  if (totalHalalas <= 0) {
    throw new AppError('Posted purchase total must be greater than zero', 400, 'PURCHASE_TOTAL_ZERO');
  }

  const lines = [];
  if (inventoryHalalas > 0) {
    if (!inventoryAccountId) {
      throw new AppError('Inventory ledger account is missing', 500, 'LEDGER_ACCOUNT_MISSING');
    }
    lines.push(debitLine(inventoryAccountId, inventoryHalalas, 'inventory'));
  }
  for (const [accountId, halalas] of expenseByAccount.entries()) {
    const mappedId = expenseAccountIds[accountId] || accountId;
    if (!mappedId) {
      throw new AppError('Expense ledger account is missing', 400, 'EXPENSE_ACCOUNT_REQUIRED');
    }
    if (halalas > 0) {
      lines.push(debitLine(mappedId, halalas, 'expense'));
    }
  }
  if (vatHalalas > 0) {
    if (!inputVatAccountId) {
      throw new AppError('Recoverable input VAT account is missing', 500, 'LEDGER_ACCOUNT_MISSING');
    }
    lines.push(debitLine(inputVatAccountId, vatHalalas, 'input_vat'));
  }
  lines.push(creditLine(creditAccountId, totalHalalas, 'credit'));

  const debitHalalas = lines.reduce((sum, line) => sum + line.debit_halalas, 0);
  const creditHalalas = lines.reduce((sum, line) => sum + line.credit_halalas, 0);
  if (debitHalalas !== creditHalalas || debitHalalas !== totalHalalas) {
    throw new AppError(
      'Purchase journal is not balanced against stored invoice total',
      500,
      'UNBALANCED_PURCHASE_JOURNAL'
    );
  }
  return lines;
};

const postingPreview = ({ invoice, items, creditCode }) => {
  assertStoredTotals(invoice, items);
  const inventoryItems = items.filter((item) => item.destination === 'inventory');
  const expenseItems = items.filter((item) => item.destination === 'expense');
  const inventoryHalalas = sumHalalas(inventoryItems, () => true);
  const expenseHalalas = sumHalalas(expenseItems, () => true);
  const vatHalalas = integerHalalas(invoice.vat_halalas || 0);
  const totalHalalas = integerHalalas(invoice.total_halalas || 0);
  const debitHalalas = inventoryHalalas + expenseHalalas + vatHalalas;
  const method = invoice.payment_method;
  return {
    payment_method: method,
    credit_account_code: creditCode || creditAccountCode(method),
    inventory_halalas: inventoryHalalas,
    expense_halalas: expenseHalalas,
    input_vat_halalas: vatHalalas,
    credit_halalas: totalHalalas,
    debit_halalas: debitHalalas,
    credit_equals_debit: debitHalalas === totalHalalas,
    recoverable_vat_policy: RECOVERABLE_VAT_POLICY,
    non_recoverable_vat_supported: false,
    aggregate_ap_only: method === 'credit' || method === 'other',
    inventory_lines: inventoryItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      inventory_item_id: item.inventory_item_id,
      lot_number: item.lot_number || null,
      expiry_date: item.expiry_date || null,
      unlabeled_lot: !String(item.lot_number || '').trim(),
      line_net_halalas: integerHalalas(item.line_net_halalas || 0),
    })),
    expense_lines: expenseItems.map((item) => ({
      id: item.id,
      description: item.description,
      expense_account_id: item.expense_account_id,
      line_net_halalas: integerHalalas(item.line_net_halalas || 0),
    })),
  };
};

module.exports = {
  PURCHASE_LEDGER_ACCOUNTS,
  CREDIT_ACCOUNT_BY_METHOD,
  SALES_VAT_PAYABLE_CODE,
  RECOVERABLE_VAT_POLICY,
  creditAccountCode,
  buildPurchaseJournalLines,
  postingPreview,
  assertStoredTotals,
};
