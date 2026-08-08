import { VAT_RATE, grossToNet, roundMoney } from './vat';
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
  if (type === DISCOUNT_TYPES.PERCENT && v > 0) return roundMoney(Math.min(sub, sub * (v / 100)));
  if (type === DISCOUNT_TYPES.AMOUNT && v > 0) return roundMoney(Math.min(sub, v));
  return 0;
}

const lineNetTotal = (item, catalogPrices, taxRate = VAT_RATE) => {
  const unit = parseFloat(item.unit_price) || 0;
  const qty = parseInt(item.quantity, 10) || 1;
  if (!catalogPrices && item.total_price != null && item.total_price !== '') {
    return parseFloat(item.total_price) || 0;
  }
  const netUnit = catalogPrices ? grossToNet(unit, taxRate) : unit;
  return netUnit * qty;
};

/**
 * Split line subtotals (excl. VAT) for services vs field visit.
 * @param {boolean} catalogPrices — true when unit_price is VAT-inclusive (catalog / new quote lines)
 */
export function splitLineSubtotals(items = [], { catalogPrices = false, taxRate = VAT_RATE } = {}) {
  let serviceSubtotal = 0;
  let fieldVisitSubtotal = 0;
  for (const item of items) {
    const line = lineNetTotal(item, catalogPrices, taxRate);
    if (isFieldVisitItem(item)) fieldVisitSubtotal += line;
    else serviceSubtotal += line;
  }
  return {
    serviceSubtotal,
    fieldVisitSubtotal,
    subtotal: serviceSubtotal + fieldVisitSubtotal,
  };
}

/** Snap classic VAT 0.01/0.02 drift back to whole riyals (catalog prices are VAT-inclusive). */
function snapHalalaDrift(amount) {
  const whole = Math.round(amount);
  const drift = Math.abs(amount - whole);
  if (drift > 0 && drift <= 0.02) return whole;
  return roundMoney(amount);
}

/**
 * VAT-inclusive total resilient to DECIMAL(10,2) net storage at payment time.
 * Catalog (gross) lines sum directly; net lines combine per-line + factor rounding.
 */
function resolveVatInclusiveTotal(items, taxableRaw, taxRate, catalogPrices) {
  const rate = parseFloat(taxRate) || 15;
  const factor = 1 + rate / 100;
  const factorTotal = roundMoney(taxableRaw * factor);

  if (catalogPrices) {
    let grossSum = 0;
    let netSum = 0;
    for (const item of items || []) {
      const qty = parseInt(item.quantity, 10) || 1;
      const gross = roundMoney((parseFloat(item.unit_price) || 0) * qty);
      grossSum += gross;
      netSum += grossToNet(gross, rate);
    }
    grossSum = roundMoney(grossSum);
    if (!(netSum > 0)) return snapHalalaDrift(factorTotal);
    if (Math.abs(taxableRaw - netSum) < 0.000001) return snapHalalaDrift(grossSum);
    return snapHalalaDrift(grossSum * (taxableRaw / netSum));
  }

  let netSum = 0;
  let perLineGross = 0;
  for (const item of items || []) {
    const qty = parseInt(item.quantity, 10) || 1;
    const net = (item.total_price != null && item.total_price !== '')
      ? (parseFloat(item.total_price) || 0)
      : (parseFloat(item.unit_price) || 0) * qty;
    netSum += net;
    perLineGross += roundMoney(net * factor);
  }
  perLineGross = roundMoney(perLineGross);

  if (!(netSum > 0)) return snapHalalaDrift(factorTotal);
  if (Math.abs(taxableRaw - netSum) >= 0.000001) {
    return snapHalalaDrift(perLineGross * (taxableRaw / netSum));
  }
  const perLineClean = Math.abs(perLineGross - Math.round(perLineGross)) < 0.001;
  const factorClean = Math.abs(factorTotal - Math.round(factorTotal)) < 0.001;
  if (perLineClean && !factorClean) return snapHalalaDrift(perLineGross);
  if (factorClean && !perLineClean) return snapHalalaDrift(factorTotal);
  return snapHalalaDrift(factorTotal);
}

export function calcSplitTotals(
  items,
  serviceDiscountType,
  serviceDiscountValue,
  fieldVisitDiscountType,
  fieldVisitDiscountValue,
  taxRate = VAT_RATE,
  options = {},
) {
  const { catalogPrices = false } = options;
  const list = items || [];
  const { serviceSubtotal, fieldVisitSubtotal, subtotal: subtotalRaw } = splitLineSubtotals(list, { catalogPrices, taxRate });
  const discountAmount = resolveDiscountAmount(serviceSubtotal, serviceDiscountType, serviceDiscountValue);
  const fieldVisitDiscountAmount = resolveDiscountAmount(fieldVisitSubtotal, fieldVisitDiscountType, fieldVisitDiscountValue);
  const rate = parseFloat(taxRate) || 15;
  const taxableRaw = Math.max(0, serviceSubtotal - discountAmount)
    + Math.max(0, fieldVisitSubtotal - fieldVisitDiscountAmount);
  const subtotal = roundMoney(subtotalRaw);
  const total = resolveVatInclusiveTotal(list, taxableRaw, rate, catalogPrices);
  const taxAmount = roundMoney(total - roundMoney(taxableRaw));
  return {
    subtotal,
    serviceSubtotal: roundMoney(serviceSubtotal),
    fieldVisitSubtotal: roundMoney(fieldVisitSubtotal),
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
export function buildSplitDiscountPayload(items, serviceType, serviceValue, fvType, fvValue, options = {}) {
  const { catalogPrices = true } = options;
  const { serviceSubtotal, fieldVisitSubtotal } = splitLineSubtotals(items, { catalogPrices });
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
      { catalogPrices: options.catalogPrices === true },
    );
    const paid = parseFloat(alreadyPaid) || 0;
    return { ...totals, balanceDue: Math.max(0, totals.total - paid) };
  }
  const subRaw = parseFloat(subtotal) || 0;
  const discountAmount = resolveDiscountAmount(subRaw, discountType, discountValue);
  const rate = parseFloat(taxRate) || 15;
  const taxableRaw = Math.max(0, subRaw - discountAmount);
  const sub = roundMoney(subRaw);
  const total = roundMoney(taxableRaw * (1 + rate / 100));
  const taxAmount = roundMoney(total - roundMoney(taxableRaw));
  const paid = parseFloat(alreadyPaid) || 0;
  return {
    subtotal: sub,
    discountAmount,
    fieldVisitDiscountAmount: 0,
    taxAmount,
    total,
    balanceDue: Math.max(0, roundMoney(total - paid)),
  };
}
