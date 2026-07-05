const { FIELD_VISIT_CODE } = require('../constants/fieldVisit');

/** Resolve final discount amount from subtotal and discount inputs. */
const resolveDiscount = (subtotal, { discount_amount = 0, discount_percent = 0 } = {}) => {
  const sub = Math.max(0, parseFloat(subtotal) || 0);
  const pct = parseFloat(discount_percent) || 0;
  if (pct > 0) return Math.min(sub, sub * (pct / 100));
  return Math.min(sub, Math.max(0, parseFloat(discount_amount) || 0));
};

const isFieldVisitItem = (item) => {
  if (item?.service_code === FIELD_VISIT_CODE) return true;
  const d = String(item?.description || '');
  return /field visit|زيارة ميدانية/i.test(d);
};

const splitCatalogSubtotals = (items = []) => {
  let serviceSubtotal = 0;
  let fieldVisitSubtotal = 0;
  for (const item of items) {
    const line = (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity, 10) || 1);
    if (isFieldVisitItem(item)) fieldVisitSubtotal += line;
    else serviceSubtotal += line;
  }
  return { serviceSubtotal, fieldVisitSubtotal, subtotal: serviceSubtotal + fieldVisitSubtotal };
};

/** Compute quote/invoice totals with separate service and field-visit discounts. */
const calcDocumentTotals = (items, data = {}) => {
  const { serviceSubtotal, fieldVisitSubtotal, subtotal } = splitCatalogSubtotals(items);
  const discount_amount = resolveDiscount(serviceSubtotal, data);
  const field_visit_discount_amount = resolveDiscount(fieldVisitSubtotal, {
    discount_amount: data.field_visit_discount_amount,
    discount_percent: data.field_visit_discount_percent,
  });
  const discount_percent = parseFloat(data.discount_percent) || 0;
  const field_visit_discount_percent = parseFloat(data.field_visit_discount_percent) || 0;
  const taxRate = parseFloat(data.tax_rate) || 15;
  const taxable = Math.max(0, serviceSubtotal - discount_amount)
    + Math.max(0, fieldVisitSubtotal - field_visit_discount_amount);
  const taxAmount = taxable * (taxRate / 100);
  const total = taxable + taxAmount;
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
