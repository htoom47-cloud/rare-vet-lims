const { toHalalas, fromHalalas } = require('./money');

const DISCOUNT_KEYS = [
  'discount_amount',
  'discount_percent',
  'field_visit_discount_amount',
  'field_visit_discount_percent',
];

const paymentHasDiscountFields = (data) => {
  if (!data || typeof data !== 'object') return false;
  return DISCOUNT_KEYS.some((key) => (
    Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined
  ));
};

/** Customer still owes: stored total − payments − credit notes. May be negative (refund due). */
const computeBalanceHalalas = ({
  storedTotal,
  alreadyPaid = 0,
  creditNotesTotal = 0,
}) => (
  toHalalas(storedTotal) - toHalalas(alreadyPaid) - toHalalas(creditNotesTotal)
);

/** Credit notes may still be issued against a paid invoice. Payments do not reduce this cap. */
const computeCreditAvailableHalalas = ({ storedTotal, priorCredits = 0 }) => (
  Math.max(0, toHalalas(storedTotal) - toHalalas(priorCredits))
);

/** Cash still returnable under the existing refund workflow (payments − prior refunds). */
const computeRefundableAmount = (totalPaid, alreadyRefunded) => {
  const paid = Number(totalPaid) || 0;
  const refunded = Number(alreadyRefunded) || 0;
  return Math.max(0, paid - refunded);
};

/** Remaining refundable amount on one payment. Multi-payment refunds are separate rows. */
const computePaymentRefundableHalalas = ({ paymentAmount, refundedAgainstPayment = 0 }) => (
  Math.max(0, toHalalas(paymentAmount) - toHalalas(refundedAgainstPayment))
);

/** Attach exact per-payment refund totals (halalas). No float tolerance. */
const attachPaymentRefundTotals = (payments, refundsByPaymentId = {}) => (
  (payments || []).map((payment) => {
    const refunded = Object.prototype.hasOwnProperty.call(refundsByPaymentId, payment.id)
      ? refundsByPaymentId[payment.id]
      : (payment.refunded_amount || 0);
    const refundedH = toHalalas(refunded);
    const refundableH = computePaymentRefundableHalalas({
      paymentAmount: payment.amount,
      refundedAgainstPayment: refunded,
    });
    return {
      ...payment,
      refunded_amount: fromHalalas(refundedH),
      refundable_amount: fromHalalas(refundableH),
    };
  })
);

/** Overpayment vs net invoice (total − credits). Paid 65 + CN 65 → 65 due back. */
const computeRefundDueHalalas = ({
  storedTotal,
  alreadyPaid = 0,
  creditNotesTotal = 0,
  alreadyRefunded = 0,
}) => {
  const netInvoiceH = Math.max(0, toHalalas(storedTotal) - toHalalas(creditNotesTotal));
  return Math.max(0, toHalalas(alreadyPaid) - toHalalas(alreadyRefunded) - netInvoiceH);
};

const computeSettlement = ({
  storedTotal,
  alreadyPaid = 0,
  creditNotesTotal = 0,
  alreadyRefunded = 0,
}) => {
  const creditAvailableHalalas = computeCreditAvailableHalalas({
    storedTotal,
    priorCredits: creditNotesTotal,
  });
  const rawBalanceHalalas = computeBalanceHalalas({
    storedTotal,
    alreadyPaid,
    creditNotesTotal,
  });
  const refundDueHalalas = computeRefundDueHalalas({
    storedTotal,
    alreadyPaid,
    creditNotesTotal,
    alreadyRefunded,
  });
  const paidHalalas = toHalalas(alreadyPaid);
  const creditHalalas = toHalalas(creditNotesTotal);
  const balanceDueHalalas = Math.max(0, rawBalanceHalalas);

  let coverage = 'open';
  if (refundDueHalalas > 0) coverage = 'refund_due';
  else if (balanceDueHalalas > 0) coverage = paidHalalas > 0 ? 'partial' : 'open';
  else if (creditHalalas > 0 && paidHalalas <= 0) coverage = 'credited';
  else if (creditHalalas > 0 && paidHalalas > 0) coverage = 'paid_and_credited';
  else if (paidHalalas > 0) coverage = 'paid';

  return {
    credit_available: fromHalalas(creditAvailableHalalas),
    net_total: fromHalalas(Math.max(0, toHalalas(storedTotal) - creditHalalas)),
    balance_due: fromHalalas(balanceDueHalalas),
    refund_due: fromHalalas(refundDueHalalas),
    credit_notes_total: fromHalalas(creditHalalas),
    total_paid: fromHalalas(paidHalalas),
    already_refunded: fromHalalas(toHalalas(alreadyRefunded)),
    coverage,
  };
};

const evaluatePayment = ({
  storedTotal,
  alreadyPaid = 0,
  creditNotesTotal = 0,
  amount,
  paymentData = {},
}) => {
  if (paymentHasDiscountFields(paymentData)) {
    return {
      ok: false,
      code: 'INVOICE_TOTALS_LOCKED',
      message: 'Issued invoice totals are locked. Use a credit note for post-issue adjustments.',
    };
  }

  const amountHalalas = toHalalas(amount);
  if (amountHalalas <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Invalid payment amount' };
  }

  const balanceHalalas = computeBalanceHalalas({
    storedTotal,
    alreadyPaid,
    creditNotesTotal,
  });
  if (balanceHalalas <= 0) {
    return {
      ok: false,
      code: 'ZERO_BALANCE',
      message: 'Invoice has no remaining balance',
    };
  }
  if (amountHalalas > balanceHalalas) {
    return { ok: false, code: 'OVERPAYMENT', message: 'Payment exceeds balance due' };
  }

  return {
    ok: true,
    amountHalalas,
    balanceHalalas,
    newPaidHalalas: toHalalas(alreadyPaid) + amountHalalas,
  };
};

/**
 * Stored invoice_status stays on the existing enum.
 * Credit-note-only coverage must not be written as `paid`.
 */
const invoiceStatusAfterSettlement = (storedTotal, paidHalalas, creditNotesTotal = 0) => {
  const remaining = computeBalanceHalalas({
    storedTotal,
    alreadyPaid: fromHalalas(paidHalalas),
    creditNotesTotal,
  });
  if (paidHalalas <= 0) return 'issued';
  if (remaining <= 0) return 'paid';
  return 'partial';
};

const allocateCreditNote = ({
  invoiceTotal,
  invoiceTax,
  priorCredits = 0,
  requestedTotal,
}) => {
  const availableHalalas = computeCreditAvailableHalalas({
    storedTotal: invoiceTotal,
    priorCredits,
  });
  if (availableHalalas <= 0) {
    return {
      ok: false,
      code: 'NOTHING_TO_CREDIT',
      message: 'Invoice has no remaining amount available to credit',
    };
  }

  const hasRequest = requestedTotal !== undefined && requestedTotal !== null && requestedTotal !== '';
  const creditHalalas = hasRequest ? toHalalas(requestedTotal) : availableHalalas;
  if (creditHalalas <= 0) {
    return {
      ok: false,
      code: 'INVALID_AMOUNT',
      message: 'Credit note total must be greater than zero',
    };
  }
  if (creditHalalas > availableHalalas) {
    return {
      ok: false,
      code: 'CREDIT_EXCEEDS_BALANCE',
      message: 'Credit note exceeds remaining creditable amount',
    };
  }

  const invoiceTotalHalalas = toHalalas(invoiceTotal);
  const invoiceTaxHalalas = toHalalas(invoiceTax);
  const taxHalalas = invoiceTotalHalalas === 0
    ? 0
    : Math.round((creditHalalas * invoiceTaxHalalas) / invoiceTotalHalalas);
  const subtotalHalalas = creditHalalas - taxHalalas;

  return {
    ok: true,
    subtotal: fromHalalas(subtotalHalalas),
    tax_amount: fromHalalas(taxHalalas),
    total: fromHalalas(creditHalalas),
  };
};

const journalIsBalanced = (lines) => {
  if (!Array.isArray(lines) || lines.length < 2) return false;
  const debit = lines.reduce((sum, line) => sum + toHalalas(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + toHalalas(line.credit), 0);
  return debit === credit && debit > 0;
};

const buildInvoiceJournalLines = ({ total, tax_amount, arId, revId, vatId }) => {
  const totalHalalas = toHalalas(total);
  const taxHalalas = toHalalas(tax_amount);
  const revenueHalalas = totalHalalas - taxHalalas;
  if (totalHalalas <= 0) return [];

  const lines = [{ accountId: arId, debit: fromHalalas(totalHalalas), credit: 0 }];
  if (revenueHalalas > 0) {
    lines.push({ accountId: revId, debit: 0, credit: fromHalalas(revenueHalalas) });
  }
  if (taxHalalas > 0) {
    lines.push({ accountId: vatId, debit: 0, credit: fromHalalas(taxHalalas) });
  }
  return lines;
};

const buildPaymentJournalLines = ({ amount, cashId, arId }) => {
  const amountHalalas = toHalalas(amount);
  if (amountHalalas <= 0) return [];
  const value = fromHalalas(amountHalalas);
  return [
    { accountId: cashId, debit: value, credit: 0 },
    { accountId: arId, debit: 0, credit: value },
  ];
};

const buildRefundJournalLines = ({ amount, cashId, arId }) => {
  const amountHalalas = toHalalas(amount);
  if (amountHalalas <= 0) return [];
  const value = fromHalalas(amountHalalas);
  return [
    { accountId: arId, debit: value, credit: 0 },
    { accountId: cashId, debit: 0, credit: value },
  ];
};

const buildCreditNoteJournalLines = ({ total, tax_amount, arId, revId, vatId }) => {
  const totalHalalas = toHalalas(total);
  const taxHalalas = toHalalas(tax_amount);
  const revenueHalalas = totalHalalas - taxHalalas;
  if (totalHalalas <= 0) return [];

  const lines = [];
  if (revenueHalalas > 0) {
    lines.push({ accountId: revId, debit: fromHalalas(revenueHalalas), credit: 0 });
  }
  if (taxHalalas > 0) {
    lines.push({ accountId: vatId, debit: fromHalalas(taxHalalas), credit: 0 });
  }
  lines.push({ accountId: arId, debit: 0, credit: fromHalalas(totalHalalas) });
  return lines;
};

const registerJournalSource = (posted, sourceType, sourceId) => {
  const key = `${sourceType}:${sourceId}`;
  if (posted.has(key)) {
    return { ok: false, code: 'DUPLICATE_JOURNAL', message: 'Journal already posted for this source' };
  }
  posted.add(key);
  return { ok: true, key };
};

/** After 42P01 (or any SQL error) inside a txn, never continue — rollback only. */
const afterSqlErrorInTransaction = (err) => ({
  continue: false,
  rollback: true,
  code: err && err.code === '42P01' ? 'CREDIT_NOTES_UNAVAILABLE' : (err?.code || 'SQL_ERROR'),
});

const netVatPeriod = ({ invoices = [], creditNotes = [] }) => {
  const documents = [
    ...invoices.map((row) => ({
      type: 'invoice',
      date: row.date,
      number: row.number,
      tax: Number(row.tax) || 0,
      gross: Number(row.total ?? row.gross) || 0,
    })),
    ...creditNotes.map((row) => ({
      type: 'credit_note',
      date: row.date,
      number: row.number,
      tax: -(Number(row.tax) || 0),
      gross: -(Number(row.total ?? row.gross) || 0),
    })),
  ];
  const totals = documents.reduce(
    (acc, doc) => ({
      tax: acc.tax + doc.tax,
      gross: acc.gross + doc.gross,
      invoices: acc.invoices + (doc.type === 'invoice' ? 1 : 0),
      credit_notes: acc.credit_notes + (doc.type === 'credit_note' ? 1 : 0),
    }),
    { tax: 0, gross: 0, invoices: 0, credit_notes: 0 }
  );
  return { documents, totals };
};

const customerArBalance = (invoices = []) => invoices.reduce((sum, invoice) => {
  const settlement = computeSettlement(invoice);
  return sum + toHalalas(settlement.balance_due);
}, 0);

module.exports = {
  DISCOUNT_KEYS,
  paymentHasDiscountFields,
  computeBalanceHalalas,
  computeCreditAvailableHalalas,
  computeRefundableAmount,
  computePaymentRefundableHalalas,
  attachPaymentRefundTotals,
  computeRefundDueHalalas,
  computeSettlement,
  evaluatePayment,
  invoiceStatusAfterSettlement,
  allocateCreditNote,
  journalIsBalanced,
  buildInvoiceJournalLines,
  buildPaymentJournalLines,
  buildRefundJournalLines,
  buildCreditNoteJournalLines,
  registerJournalSource,
  afterSqlErrorInTransaction,
  netVatPeriod,
  customerArBalance,
};
