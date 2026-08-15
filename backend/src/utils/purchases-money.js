const { AppError } = require('../middleware/errorHandler');

const STANDARD_VAT_BPS = 1500;
const TAX_CATEGORIES = ['standard', 'zero_rated', 'exempt', 'out_of_scope'];

const toHalalas = (sar) => {
  if (sar == null || sar === '') return 0;
  const num = Number(sar);
  if (!Number.isFinite(num) || num < 0) {
    throw new AppError('Invalid money amount', 400, 'INVALID_AMOUNT');
  }
  return Math.round(num * 100);
};

const fromHalalas = (halalas) => (Number(halalas || 0) / 100).toFixed(2);

const lineNetHalalas = (quantity, unitPriceHalalas, discountHalalas = 0) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new AppError('Quantity must be greater than zero', 400, 'INVALID_QUANTITY');
  }
  const unit = Number(unitPriceHalalas);
  const discount = Number(discountHalalas || 0);
  if (!Number.isInteger(unit) || unit < 0 || !Number.isInteger(discount) || discount < 0) {
    throw new AppError('Invalid line money', 400, 'INVALID_AMOUNT');
  }
  const gross = Math.round(qty * unit);
  if (discount > gross) {
    throw new AppError('Line discount exceeds line amount', 400, 'INVALID_DISCOUNT');
  }
  return gross - discount;
};

const normalizeLineTax = (item, defaultCategory) => {
  const category = item.tax_category || defaultCategory;
  if (!TAX_CATEGORIES.includes(category)) {
    throw new AppError('Invalid tax category', 400, 'INVALID_TAX_CATEGORY');
  }
  const rateBps = category === 'standard' ? STANDARD_VAT_BPS : 0;
  if (item.tax_rate_bps != null && Number(item.tax_rate_bps) !== rateBps) {
    throw new AppError('Tax rate does not match the selected category', 400, 'INVALID_TAX_RATE');
  }
  if (item.tax_rate != null && Number(item.tax_rate) !== rateBps / 100) {
    throw new AppError('Tax rate does not match the selected category', 400, 'INVALID_TAX_RATE');
  }
  return {
    tax_category: category,
    tax_rate_bps: rateBps,
    tax_rate: rateBps / 100,
  };
};

const allocateHeaderDiscount = (lineNets, headerDiscount) => {
  const subtotal = lineNets.reduce((sum, value) => sum + value, 0);
  if (headerDiscount === 0 || subtotal === 0) return lineNets.map(() => 0);
  const allocs = [];
  let used = 0;
  for (let i = 0; i < lineNets.length; i += 1) {
    if (i === lineNets.length - 1) {
      allocs.push(headerDiscount - used);
    } else {
      const share = Math.floor((headerDiscount * lineNets[i]) / subtotal);
      allocs.push(share);
      used += share;
    }
  }
  return allocs;
};

const computeInvoiceTotals = (items, headerDiscountHalalas = 0, options = {}) => {
  const defaultCategory = options.defaultCategory || 'standard';
  const computedItems = items.map((item, index) => {
    const unit = item.unit_price_halalas != null
      ? Number(item.unit_price_halalas)
      : toHalalas(item.unit_price_sar);
    const discount = item.discount_halalas != null
      ? Number(item.discount_halalas)
      : toHalalas(item.discount_sar);
    const lineNet = lineNetHalalas(item.quantity, unit, discount);
    const tax = normalizeLineTax(item, defaultCategory);
    return {
      ...item,
      line_no: index + 1,
      unit_price_halalas: unit,
      discount_halalas: discount,
      line_net_halalas: lineNet,
      ...tax,
    };
  });

  const subtotal = computedItems.reduce((sum, item) => sum + item.line_net_halalas, 0);
  const discount = Number(headerDiscountHalalas || 0);
  if (!Number.isInteger(discount) || discount < 0) {
    throw new AppError('Invalid header discount', 400, 'INVALID_DISCOUNT');
  }
  if (discount > subtotal) {
    throw new AppError('Header discount exceeds subtotal', 400, 'INVALID_DISCOUNT');
  }

  const allocated = allocateHeaderDiscount(
    computedItems.map((item) => item.line_net_halalas),
    discount
  );

  computedItems.forEach((item, index) => {
    const taxable = item.line_net_halalas - allocated[index];
    if (taxable < 0) {
      throw new AppError('Header discount exceeds a line amount', 400, 'INVALID_DISCOUNT');
    }
    item.allocated_discount_halalas = allocated[index];
    item.taxable_halalas = taxable;
    item.vat_halalas = Math.round((taxable * item.tax_rate_bps) / 10000);
  });

  const vat = computedItems.reduce((sum, item) => sum + item.vat_halalas, 0);
  const total = subtotal - discount + vat;
  if (subtotal < 0 || discount < 0 || vat < 0 || total < 0) {
    throw new AppError('Totals cannot be negative', 400, 'INVALID_AMOUNT');
  }

  const summaryMap = new Map();
  computedItems.forEach((item) => {
    const key = `${item.tax_category}:${item.tax_rate_bps}`;
    const current = summaryMap.get(key) || {
      tax_category: item.tax_category,
      tax_rate_bps: item.tax_rate_bps,
      tax_rate: item.tax_rate,
      taxable_halalas: 0,
      vat_halalas: 0,
    };
    current.taxable_halalas += item.taxable_halalas;
    current.vat_halalas += item.vat_halalas;
    summaryMap.set(key, current);
  });

  return {
    items: computedItems,
    subtotal_halalas: subtotal,
    discount_halalas: discount,
    vat_halalas: vat,
    total_halalas: total,
    tax_summary: [...summaryMap.values()],
  };
};

const assertTotalsMatch = (computed, incoming) => {
  if (!incoming) return;
  const fields = ['subtotal_halalas', 'discount_halalas', 'vat_halalas', 'total_halalas'];
  for (const field of fields) {
    if (incoming[field] != null && Number(incoming[field]) !== computed[field]) {
      throw new AppError('Submitted totals do not match line items', 400, 'TOTALS_MISMATCH');
    }
  }
};

module.exports = {
  STANDARD_VAT_BPS,
  DEFAULT_VAT_BPS: STANDARD_VAT_BPS,
  TAX_CATEGORIES,
  toHalalas,
  fromHalalas,
  lineNetHalalas,
  normalizeLineTax,
  computeInvoiceTotals,
  assertTotalsMatch,
};
