const { FIELD_VISIT_CODE } = require('../constants/fieldVisit');
const { roundMoney } = require('./vat');

/** Resolve final discount amount from subtotal and discount inputs. */
const resolveDiscount = (subtotal, { discount_amount = 0, discount_percent = 0 } = {}) => {
  const sub = Math.max(0, parseFloat(subtotal) || 0);
  const pct = parseFloat(discount_percent) || 0;
  if (pct > 0) return roundMoney(Math.min(sub, sub * (pct / 100)));
  return roundMoney(Math.min(sub, Math.max(0, parseFloat(discount_amount) || 0)));
};

const isFieldVisitItem = (item) => {
  if (item?.service_code === FIELD_VISIT_CODE) return true;
  const d = String(item?.description || '');
  return /field visit|زيارة ميدانية/i.test(d);
};

const lineNetAmount = (item) => {
  const qty = parseInt(item.quantity, 10) || 1;
  if (item.total_price != null && item.total_price !== '') {
    return parseFloat(item.total_price) || 0;
  }
  return (parseFloat(item.unit_price) || 0) * qty;
};

const splitCatalogSubtotals = (items = []) => {
  let serviceSubtotal = 0;
  let fieldVisitSubtotal = 0;
  for (const item of items) {
    const line = lineNetAmount(item);
    if (isFieldVisitItem(item)) fieldVisitSubtotal += line;
    else serviceSubtotal += line;
  }
  return {
    serviceSubtotal,
    fieldVisitSubtotal,
    subtotal: serviceSubtotal + fieldVisitSubtotal,
  };
};

/**
 * Compute quote/invoice totals with separate service and field-visit discounts.
 * Total is rounded from net×(1+VAT) so VAT-inclusive catalog prices (e.g. 350) stay 350.00.
 */
const calcDocumentTotals = (items, data = {}) => {
  const { serviceSubtotal, fieldVisitSubtotal, subtotal: subtotalRaw } = splitCatalogSubtotals(items);
  const discount_amount = resolveDiscount(serviceSubtotal, data);
  const field_visit_discount_amount = resolveDiscount(fieldVisitSubtotal, {
    discount_amount: data.field_visit_discount_amount,
    discount_percent: data.field_visit_discount_percent,
  });
  const discount_percent = parseFloat(data.discount_percent) || 0;
  const field_visit_discount_percent = parseFloat(data.field_visit_discount_percent) || 0;
  const taxRate = parseFloat(data.tax_rate) || 15;
  const taxableRaw = Math.max(0, serviceSubtotal - discount_amount)
    + Math.max(0, fieldVisitSubtotal - field_visit_discount_amount);
  const subtotal = roundMoney(subtotalRaw);
  const total = roundMoney(taxableRaw * (1 + taxRate / 100));
  const taxAmount = roundMoney(total - roundMoney(taxableRaw));
  return {
    subtotal,
    discount_amount,
    discount_percent,
    field_visit_discount_amount,
    field_visit_discount_percent,
    taxRate,
    taxAmount,
    total,
  };
};

module.exports = {
  resolveDiscount,
  isFieldVisitItem,
  splitCatalogSubtotals,
  calcDocumentTotals,
};
