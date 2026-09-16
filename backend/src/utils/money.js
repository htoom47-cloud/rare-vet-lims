/** Integer-halala money helpers. 1 SAR = 100 halalas. */

const toHalalas = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100);
};

const fromHalalas = (halalas) => {
  const h = Number(halalas);
  if (!Number.isFinite(h)) return 0;
  return h / 100;
};

const asIntegerHalalas = (value) => {
  if (typeof value === 'bigint') {
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error('HALALA_NOT_INTEGER');
    return n;
  }
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
  if (value == null || value === '') return 0;
  throw new Error('HALALA_NOT_INTEGER');
};

/** Exact SAR text from integer halalas. Uses trunc/mod, not floating-point division. */
const sarTextFromHalalas = (halalas) => {
  const n = asIntegerHalalas(halalas);
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
};

const expectedCashHalalas = (collectionsH, refundsH, cashPurchaseOutflowsH) => (
  asIntegerHalalas(collectionsH || 0)
  - asIntegerHalalas(refundsH || 0)
  - asIntegerHalalas(cashPurchaseOutflowsH || 0)
);

module.exports = { toHalalas, fromHalalas, asIntegerHalalas, sarTextFromHalalas, expectedCashHalalas };
