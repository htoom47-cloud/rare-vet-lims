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

module.exports = { toHalalas, fromHalalas };
