export const DISCOUNT_TYPES = {
  NONE: 'none',
  PERCENT: 'percent',
  AMOUNT: 'amount',
};

/** Compute discount amount from subtotal and type/value. */
export function resolveDiscountAmount(subtotal, type, value) {
  const sub = Math.max(0, parseFloat(subtotal) || 0);
  const v = parseFloat(value) || 0;
  if (type === DISCOUNT_TYPES.PERCENT && v > 0) return Math.min(sub, sub * (v / 100));
  if (type === DISCOUNT_TYPES.AMOUNT && v > 0) return Math.min(sub, v);
  return 0;
}

/** Build API payload fields for discount. */
export function buildDiscountPayload(subtotal, type, value) {
  const discount_amount = resolveDiscountAmount(subtotal, type, value);
  const discount_percent = type === DISCOUNT_TYPES.PERCENT ? (parseFloat(value) || 0) : 0;
  return { discount_amount, discount_percent };
}

/** Initialize discount field state from an existing invoice. */
export function initDiscountFromInvoice(invoice) {
  if (!invoice) return { type: DISCOUNT_TYPES.NONE, value: '' };
  const pct = parseFloat(invoice.discount_percent) || 0;
  const amt = parseFloat(invoice.discount_amount) || 0;
  if (pct > 0) return { type: DISCOUNT_TYPES.PERCENT, value: String(pct) };
  if (amt > 0) return { type: DISCOUNT_TYPES.AMOUNT, value: String(amt) };
  return { type: DISCOUNT_TYPES.NONE, value: '' };
}

import { VAT_RATE } from './vat';

/** Preview invoice totals with discount before/at payment. */
export function calcInvoiceTotals(subtotal, discountType, discountValue, taxRate = VAT_RATE, alreadyPaid = 0) {
  const sub = parseFloat(subtotal) || 0;
  const discountAmount = resolveDiscountAmount(sub, discountType, discountValue);
  const taxable = Math.max(0, sub - discountAmount);
  const taxAmount = taxable * ((parseFloat(taxRate) || 15) / 100);
  const total = taxable + taxAmount;
  const paid = parseFloat(alreadyPaid) || 0;
  return {
    subtotal: sub,
    discountAmount,
    taxAmount,
    total,
    balanceDue: Math.max(0, total - paid),
  };
}
