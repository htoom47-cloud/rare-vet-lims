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

/** Catalog / price list — stored price is already VAT-inclusive. */
export const fmtCatalog = (gross) => `SAR ${(parseFloat(gross) || 0).toFixed(2)}`;

/** @deprecated Use fmtCatalog — catalog prices are gross, not net. */
export const fmtIncl = fmtCatalog;

/** Format net amount (excl. VAT). */
export const fmtNet = (net) => `SAR ${(parseFloat(net) || 0).toFixed(2)}`;

/** Format gross/total amount (already includes VAT). */
export const fmtGross = (gross) => `SAR ${(parseFloat(gross) || 0).toFixed(2)}`;

export const splitVat = (net, rate = VAT_RATE) => {
  const subtotal = parseFloat(net) || 0;
  const r = parseFloat(rate) || VAT_RATE;
  const taxAmount = subtotal * (r / 100);
  return { subtotal, taxRate: r, taxAmount, total: subtotal + taxAmount };
};

/** Sum catalog line items (unit_price × qty) — prices are VAT-inclusive. */
export const catalogLinesGrossTotal = (items) => (items || []).reduce(
  (s, i) => s + (parseFloat(i.unit_price) || 0) * (parseInt(i.quantity, 10) || 1),
  0,
);

/** Net subtotal for invoices/quotes from catalog gross line prices. */
export const catalogLinesNetSubtotal = (items, rate = VAT_RATE) => (items || []).reduce(
  (s, i) => s + grossToNet(parseFloat(i.unit_price) || 0, rate) * (parseInt(i.quantity, 10) || 1),
  0,
);
