const toAmount = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const issuedCreditTotal = (inv) => {
  if (!inv) return 0;
  if (inv.credit_notes_total != null && inv.credit_notes_total !== '') {
    return toAmount(inv.credit_notes_total);
  }
  if (Array.isArray(inv.credit_notes)) {
    return inv.credit_notes
      .filter((n) => n?.status === 'issued')
      .reduce((sum, n) => sum + toAmount(n.total), 0);
  }
  return 0;
};

export const invoiceBalanceDue = (inv) => {
  if (!inv) return 0;
  if (inv.balance_due != null && inv.balance_due !== '') {
    return Math.max(0, toAmount(inv.balance_due));
  }
  return Math.max(0, toAmount(inv.total) - toAmount(inv.total_paid) - issuedCreditTotal(inv));
};

/** Display-only. Stored invoice.status stays issued when covered by a credit note. */
export const invoiceDisplayStatus = (inv) => {
  const status = inv?.status;
  if (!inv || ['cancelled', 'refunded', 'partial_refunded', 'paid'].includes(status)) {
    return status;
  }
  const due = invoiceBalanceDue(inv);
  if (issuedCreditTotal(inv) > 0.009 && due <= 0.009) {
    return 'credited';
  }
  if (
    ['issued', 'partial'].includes(status)
    && due <= 0.009
    && toAmount(inv.total) > 0.009
    && toAmount(inv.total_paid) <= 0.009
  ) {
    return 'credited';
  }
  return status;
};

export const invoiceNeedsPayment = (inv) => {
  if (!inv) return false;
  if (['paid', 'cancelled', 'refunded'].includes(inv.status)) return false;
  return invoiceBalanceDue(inv) > 0.009;
};
