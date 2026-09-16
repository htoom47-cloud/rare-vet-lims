/** Integer-halala helpers — must match backend/src/utils/money.js. */
export const toHalalas = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100);
};

export const fromHalalas = (halalas) => {
  const h = Number(halalas);
  if (!Number.isFinite(h)) return 0;
  return h / 100;
};

export const CREDIT_NOTE_REASON_MIN = 3;
export const CREDIT_NOTE_REASON_MAX = 1000;

export const invoiceCreditAvailable = (invoice) => {
  if (invoice?.credit_available != null && invoice.credit_available !== '') {
    return fromHalalas(toHalalas(invoice.credit_available));
  }
  const total = toHalalas(invoice?.total);
  const prior = toHalalas(invoice?.credit_notes_total);
  return fromHalalas(Math.max(0, total - prior));
};

export const canIssueCreditNote = (invoice) => {
  if (!invoice) return false;
  if (['cancelled', 'refunded'].includes(invoice.status)) return false;
  return toHalalas(invoiceCreditAvailable(invoice)) > 0;
};

/**
 * Preview allocation — same proportional VAT split as backend allocateCreditNote.
 * Tax = round(credit × invoiceTax / invoiceTotal); net = credit − tax.
 */
export const previewCreditNote = ({
  invoiceTotal,
  invoiceTax,
  priorCredits = 0,
  requestedTotal,
}) => {
  const availableHalalas = Math.max(0, toHalalas(invoiceTotal) - toHalalas(priorCredits));
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
    available: fromHalalas(availableHalalas),
  };
};

export const validateCreditNoteForm = ({ reason, amount, available }) => {
  const trimmed = String(reason || '').trim();
  if (trimmed.length < CREDIT_NOTE_REASON_MIN) {
    return { ok: false, code: 'REASON_TOO_SHORT' };
  }
  if (trimmed.length > CREDIT_NOTE_REASON_MAX) {
    return { ok: false, code: 'REASON_TOO_LONG' };
  }
  if (amount === '' || amount == null) {
    return { ok: false, code: 'AMOUNT_REQUIRED' };
  }
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  const amountHalalas = toHalalas(n);
  if (amountHalalas <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  if (amountHalalas > toHalalas(available)) {
    return { ok: false, code: 'CREDIT_EXCEEDS_BALANCE' };
  }
  return { ok: true, reason: trimmed, total: fromHalalas(amountHalalas) };
};

export const formErrorKey = (code) => ({
  REASON_TOO_SHORT: 'billing.creditNoteReasonRequired',
  REASON_TOO_LONG: 'billing.creditNoteReasonTooLong',
  AMOUNT_REQUIRED: 'billing.creditNoteAmountRequired',
  INVALID_AMOUNT: 'billing.creditNoteAmountInvalid',
  CREDIT_EXCEEDS_BALANCE: 'billing.creditNoteAmountExceeds',
  NOTHING_TO_CREDIT: 'billing.creditNoteNothingToCredit',
}[code] || 'common.error');

export const buildCreditNoteRequest = ({ invoiceId, reason, amount, available }) => {
  const validated = validateCreditNoteForm({ reason, amount, available });
  if (!validated.ok) return validated;
  return {
    ok: true,
    body: {
      invoice_id: invoiceId,
      reason: validated.reason,
      total: validated.total,
    },
  };
};
