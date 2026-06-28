/** Resolve final discount amount from subtotal and discount inputs. */
const resolveDiscount = (subtotal, { discount_amount = 0, discount_percent = 0 } = {}) => {
  const sub = Math.max(0, parseFloat(subtotal) || 0);
  const pct = parseFloat(discount_percent) || 0;
  if (pct > 0) return Math.min(sub, sub * (pct / 100));
  return Math.min(sub, Math.max(0, parseFloat(discount_amount) || 0));
};

module.exports = { resolveDiscount };
