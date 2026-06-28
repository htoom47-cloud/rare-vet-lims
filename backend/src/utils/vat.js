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

module.exports = { VAT_RATE, netToGross, grossToNet, splitVat };
