const VAT_RATE = 15;

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
  const subtotal = parseFloat(net) || 0;
  const r = parseFloat(rate) || VAT_RATE;
  const taxAmount = subtotal * (r / 100);
  return { subtotal, taxRate: r, taxAmount, total: subtotal + taxAmount };
};

/** Catalog prices in tests/packages are VAT-inclusive; convert lines to net for invoicing. */
const prepareCatalogItems = (items, rate = VAT_RATE) => (items || []).map((item) => {
  const qty = parseInt(item.quantity, 10) || 1;
  const netUnit = grossToNet(parseFloat(item.unit_price) || 0, rate);
  return {
    ...item,
    quantity: qty,
    unit_price: netUnit,
    total_price: netUnit * qty,
  };
});

module.exports = {
  VAT_RATE, netToGross, grossToNet, splitVat, prepareCatalogItems,
};
