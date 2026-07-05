import { VAT_RATE } from './vat';
import { isFieldVisitItem } from './fieldVisitService';

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

export function splitLineSubtotals(items = []) {
  let serviceSubtotal = 0;
  let fieldVisitSubtotal = 0;
  for (const item of items) {
    const line = (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity, 10) || 1);
    if (isFieldVisitItem(item)) fieldVisitSubtotal += line;
    else serviceSubtotal += line;
  }
  return { serviceSubtotal, fieldVisitSubtotal, subtotal: serviceSubtotal + fieldVisitSubtotal };
}

export function calcSplitTotals(
  items,
  serviceDiscountType,
  serviceDiscountValue,
  fieldVisitDiscountType,
  fieldVisitDiscountValue,
  taxRate = VAT_RATE,
) {
  const { serviceSubtotal, fieldVisitSubtotal, subtotal } = splitLineSubtotals(items);
  const discountAmount = resolveDiscountAmount(serviceSubtotal, serviceDiscountType, serviceDiscountValue);
  const fieldVisitDiscountAmount = resolveDiscountAmount(fieldVisitSubtotal, fieldVisitDiscountType, fieldVisitDiscountValue);
  const taxable = Math.max(0, serviceSubtotal - discountAmount) + Math.max(0, fieldVisitSubtotal - fieldVisitDiscountAmount);
  const taxAmount = taxable * ((parseFloat(taxRate) || 15) / 100);
  const total = taxable + taxAmount;
  return {
    subtotal,
    serviceSubtotal,
    fieldVisitSubtotal,
    discountAmount,
    fieldVisitDiscountAmount,
    taxAmount,
    total,
  };
}

/** Build API payload fields for service discount only (legacy). */
export function buildDiscountPayload(subtotal, type, value) {
  const discount_amount = resolveDiscountAmount(subtotal, type, value);
  const discount_percent = type === DISCOUNT_TYPES.PERCENT ? (parseFloat(value) || 0) : 0;
  return { discount_amount, discount_percent };
}

/** Build API payload with separate service and field-visit discounts. */
export function buildSplitDiscountPayload(items, serviceType, serviceValue, fvType, fvValue) {
  const { serviceSubtotal, fieldVisitSubtotal } = splitLineSubtotals(items);
  const discount_amount = resolveDiscountAmount(serviceSubtotal, serviceType, serviceValue);
  const discount_percent = serviceType === DISCOUNT_TYPES.PERCENT ? (parseFloat(serviceValue) || 0) : 0;
  const field_visit_discount_amount = resolveDiscountAmount(fieldVisitSubtotal, fvType, fvValue);
  const field_visit_discount_percent = fvType === DISCOUNT_TYPES.PERCENT ? (parseFloat(fvValue) || 0) : 0;
  return {
    discount_amount,
    discount_percent,
    field_visit_discount_amount,
    field_visit_discount_percent,
  };
}

/** Initialize service discount field state from an existing invoice. */
export function initDiscountFromInvoice(invoice) {
  if (!invoice) return { type: DISCOUNT_TYPES.NONE, value: '' };
  const pct = parseFloat(invoice.discount_percent) || 0;
  const amt = parseFloat(invoice.discount_amount) || 0;
  if (pct > 0) return { type: DISCOUNT_TYPES.PERCENT, value: String(pct) };
  if (amt > 0) return { type: DISCOUNT_TYPES.AMOUNT, value: String(amt) };
  return { type: DISCOUNT_TYPES.NONE, value: '' };
}

/** Initialize field-visit discount field state from an existing invoice. */
export function initFieldVisitDiscountFromInvoice(invoice) {
  if (!invoice) return { type: DISCOUNT_TYPES.NONE, value: '' };
  const pct = parseFloat(invoice.field_visit_discount_percent) || 0;
  const amt = parseFloat(invoice.field_visit_discount_amount) || 0;
  if (pct > 0) return { type: DISCOUNT_TYPES.PERCENT, value: String(pct) };
  if (amt > 0) return { type: DISCOUNT_TYPES.AMOUNT, value: String(amt) };
  return { type: DISCOUNT_TYPES.NONE, value: '' };
}

/** Preview invoice totals with split discounts before/at payment. */
export function calcInvoiceTotals(
  subtotal,
  discountType,
  discountValue,
  taxRate = VAT_RATE,
  alreadyPaid = 0,
  options = {},
) {
  if (options.items) {
    const totals = calcSplitTotals(
      options.items,
      discountType,
      discountValue,
      options.fvDiscountType || DISCOUNT_TYPES.NONE,
      options.fvDiscountValue || '',
      taxRate,
    );
    const paid = parseFloat(alreadyPaid) || 0;
    return { ...totals, balanceDue: Math.max(0, totals.total - paid) };
  }
  const sub = parseFloat(subtotal) || 0;
  const discountAmount = resolveDiscountAmount(sub, discountType, discountValue);
  const taxable = Math.max(0, sub - discountAmount);
  const taxAmount = taxable * ((parseFloat(taxRate) || 15) / 100);
  const total = taxable + taxAmount;
  const paid = parseFloat(alreadyPaid) || 0;
  return {
    subtotal: sub,
    discountAmount,
    fieldVisitDiscountAmount: 0,
    taxAmount,
    total,
    balanceDue: Math.max(0, total - paid),
  };
}
