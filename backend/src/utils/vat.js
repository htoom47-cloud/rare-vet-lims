const VAT_RATE = 15;

/** Round to 2 decimal places (halalas) for money fields. */
const roundMoney = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
};

const netToGross = (net, rate = VAT_RATE) => {
  const n = parseFloat(net) || 0;
  return n * (1 + (parseFloat(rate) || VAT_RATE) / 100);
};

const grossToNet = (gross, rate = VAT_RATE) => {
  const g = parseFloat(gross) || 0;
  const r = parseFloat(rate) || VAT_RATE;
  return g / (1 + r / 100);
};

const splitVat = (net, rate = VAT_RATE) => {
  const taxableRaw = parseFloat(net) || 0;
  const r = parseFloat(rate) || VAT_RATE;
  const subtotal = roundMoney(taxableRaw);
  const total = roundMoney(taxableRaw * (1 + r / 100));
  const taxAmount = roundMoney(total - subtotal);
  return { subtotal, taxRate: r, taxAmount, total };
};

/**
 * Catalog prices in tests/packages are VAT-inclusive; convert lines to net for invoicing.
 * Keeps full-precision net so document-level rounding can restore the catalog gross total.
 */
const prepareCatalogItems = (items, rate = VAT_RATE) => (items || []).map((item) => {
  const qty = parseInt(item.quantity, 10) || 1;
  const grossUnit = parseFloat(item.unit_price) || 0;
  const grossLine = roundMoney(grossUnit * qty);
  const netLine = grossToNet(grossLine, rate);
  return {
    ...item,
    quantity: qty,
    unit_price: qty ? netLine / qty : 0,
    total_price: netLine,
  };
});

module.exports = {
  VAT_RATE,
  roundMoney,
  netToGross,
  grossToNet,
  splitVat,
  prepareCatalogItems,
};
