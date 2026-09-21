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

/** Named discount that applies to field visit only (not lab tests). */
const isFieldVisitDiscountPreset = (preset) => {
  const s = `${preset?.code || ''} ${preset?.name || ''} ${preset?.name_ar || ''}`;
  return /زيار|visit|field[_\s-]?visit|free[_\s-]?visit/i.test(s);
};

const filterPresetsByScope = (presets = [], scope = 'services') => {
  const list = Array.isArray(presets) ? presets : [];
  if (scope === 'field_visit') return list.filter(isFieldVisitDiscountPreset);
  if (scope === 'services') return list.filter((p) => !isFieldVisitDiscountPreset(p));
  return list;
};

const lineNetAmount = (item) => {
  const qty = parseInt(item.quantity, 10) || 1;
  if (item.total_price != null && item.total_price !== '') {
    return parseFloat(item.total_price) || 0;
  }
  return (parseFloat(item.unit_price) || 0) * qty;
};

const countDistinctAnimals = (items = []) => {
  const ids = new Set();
  for (const item of items) {
    if (item?.animal_id) ids.add(String(item.animal_id));
  }
  return ids.size;
};

/** Test/package quantity on a quote or invoice — field visit does not count. */
const countCatalogTestQuantity = (items = []) => {
  let n = 0;
  for (const item of items) {
    if (isFieldVisitItem(item)) continue;
    n += Math.max(1, parseInt(item.quantity, 10) || 1);
  }
  return n;
};

/** Volume used to unlock bulk discounts: animals or test quantity, whichever is higher. */
const discountVolumeCount = (items = [], extraAnimalCount = 0) => Math.max(
  countDistinctAnimals(items),
  parseInt(extraAnimalCount, 10) || 0,
  countCatalogTestQuantity(items),
);

const grossFromNet = (net, taxRate = 15) => {
  const rate = parseFloat(taxRate) || 15;
  return snapHalalaDrift(roundMoney((parseFloat(net) || 0) * (1 + rate / 100)));
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

/** Snap classic VAT 0.01/0.02 drift back to whole riyals (catalog prices are VAT-inclusive). */
const snapHalalaDrift = (amount) => {
  const whole = Math.round(amount);
  const drift = Math.abs(amount - whole);
  if (drift > 0 && drift <= 0.02) return whole;
  return roundMoney(amount);
};

/**
 * Choose VAT-inclusive total resilient to DECIMAL(10,2) net line storage.
 * Per-line gross + factor, then snap ≤2-halala drift (1499.99→1500, 349.99→350).
 */
const resolveVatInclusiveTotal = (items, taxableRaw, taxRate) => {
  const rate = parseFloat(taxRate) || 15;
  const factor = 1 + rate / 100;
  const factorTotal = roundMoney(taxableRaw * factor);

  let netSum = 0;
  let perLineGross = 0;
  for (const item of items || []) {
    const net = lineNetAmount(item);
    netSum += net;
    perLineGross += roundMoney(net * factor);
  }
  perLineGross = roundMoney(perLineGross);

  let candidate = factorTotal;
  if (netSum > 0 && Math.abs(taxableRaw - netSum) >= 0.000001) {
    candidate = roundMoney(perLineGross * (taxableRaw / netSum));
  } else if (netSum > 0) {
    const perLineClean = Math.abs(perLineGross - Math.round(perLineGross)) < 0.001;
    const factorClean = Math.abs(factorTotal - Math.round(factorTotal)) < 0.001;
    if (perLineClean && !factorClean) candidate = perLineGross;
    else if (factorClean && !perLineClean) candidate = factorTotal;
    else candidate = factorTotal;
  }
  return snapHalalaDrift(candidate);
};

/** Compute quote/invoice totals with separate service and field-visit discounts. */
const calcDocumentTotals = (items, data = {}) => {
  const list = items || [];
  const { serviceSubtotal, fieldVisitSubtotal, subtotal: subtotalRaw } = splitCatalogSubtotals(list);
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
  const total = resolveVatInclusiveTotal(list, taxableRaw, taxRate);
  const total_before_discount = resolveVatInclusiveTotal(list, subtotalRaw, taxRate);
  const taxAmount = roundMoney(total - roundMoney(taxableRaw));
  return {
    subtotal,
    discount_amount,
    discount_percent,
    field_visit_discount_amount,
    field_visit_discount_percent,
    discount_amount_gross: grossFromNet(discount_amount, taxRate),
    field_visit_discount_amount_gross: grossFromNet(field_visit_discount_amount, taxRate),
    taxRate,
    taxAmount,
    total,
    total_before_discount,
  };
};

module.exports = {
  resolveDiscount,
  isFieldVisitItem,
  isFieldVisitDiscountPreset,
  filterPresetsByScope,
  splitCatalogSubtotals,
  calcDocumentTotals,
  countDistinctAnimals,
  countCatalogTestQuantity,
  discountVolumeCount,
  grossFromNet,
};
