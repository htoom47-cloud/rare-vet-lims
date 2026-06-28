export const VAT_RATE = 15;

export const netToGross = (net, rate = VAT_RATE) => {
  const n = parseFloat(net) || 0;
  return n * (1 + (parseFloat(rate) || VAT_RATE) / 100);
};

export const grossToNet = (gross, rate = VAT_RATE) => {
  const g = parseFloat(gross) || 0;
  const r = parseFloat(rate) || VAT_RATE;
  return g / (1 + r / 100);
};

/** Format catalog/list price — VAT inclusive for customer display. */
export const fmtIncl = (net, rate = VAT_RATE) => `SAR ${netToGross(net, rate).toFixed(2)}`;

/** Format gross/total amount (already includes VAT). */
export const fmtGross = (gross) => `SAR ${(parseFloat(gross) || 0).toFixed(2)}`;

export const splitVat = (net, rate = VAT_RATE) => {
  const subtotal = parseFloat(net) || 0;
  const r = parseFloat(rate) || VAT_RATE;
  const taxAmount = subtotal * (r / 100);
  return { subtotal, taxRate: r, taxAmount, total: subtotal + taxAmount };
};
