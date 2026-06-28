export const DISCOUNT_TYPES = {
  NONE: 'none',
  PERCENT: 'percent',
  AMOUNT: 'amount',
};

/** Compute discount amount from subtotal and type/value. */
export function resolveDiscountAmount(subtotal, type, value) {
  const sub = Math.max(0, parseFloat(subtotal) || 0);
  const v = parseFloat(value) || 0;
  if (type === DISCOUNT_TYPES.PERCENT && v > 0) return Math.min(sub, sub * (v / 100));
  if (type === DISCOUNT_TYPES.AMOUNT && v > 0) return Math.min(sub, v);
  return 0;
}

/** Build API payload fields for discount. */
export function buildDiscountPayload(subtotal, type, value) {
  const discount_amount = resolveDiscountAmount(subtotal, type, value);
  const discount_percent = type === DISCOUNT_TYPES.PERCENT ? (parseFloat(value) || 0) : 0;
  return { discount_amount, discount_percent };
}
