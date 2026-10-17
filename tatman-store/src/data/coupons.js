export function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
}

function optionalInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function shapeCoupon(body, existing = {}) {
  const type = body.type === "amount" ? "amount" : existing.type === "amount" ? "amount" : "percent";
  let value = Number(body.value ?? existing.value) || 0;
  if (type === "percent") value = Math.min(100, Math.max(0, Math.floor(value)));
  else value = Math.max(0, Math.floor(value));
  const fromBody = Array.isArray(body.countries) ? body.countries : null;
  const countries = (fromBody || existing.countries || ["qa", "sa"])
    .map((c) => String(c || "").trim().toLowerCase())
    .filter((c) => /^[a-z]{2,3}$/.test(c));
  return {
    id: existing.id || body.id,
    code: normalizeCode(body.code ?? existing.code),
    type,
    value,
    active: (body.active !== undefined ? body.active : existing.active) !== false,
    countries: countries.length ? countries : ["qa", "sa"],
    minSubtotal: optionalInt(body.minSubtotal !== undefined ? body.minSubtotal : existing.minSubtotal) || 0,
    maxUses: optionalInt(body.maxUses !== undefined ? body.maxUses : existing.maxUses),
    usedCount: Math.max(0, Math.floor(Number(existing.usedCount) || 0)),
    expiresAt: String(body.expiresAt ?? existing.expiresAt ?? "").slice(0, 32),
    note: String(body.note ?? existing.note ?? "").slice(0, 160),
  };
}

export function findCoupon(coupons, code) {
  const key = normalizeCode(code);
  if (!key) return null;
  return (coupons || []).find((c) => normalizeCode(c.code) === key) || null;
}

export function couponFail(coupon, { country, subtotal, now = new Date() } = {}) {
  if (!coupon) return "coupon_invalid";
  if (coupon.active === false) return "coupon_inactive";
  if (!(coupon.countries || []).includes(country)) return "coupon_country";
  if (coupon.expiresAt) {
    const end = new Date(coupon.expiresAt);
    if (!Number.isNaN(end.getTime()) && end < now) return "coupon_expired";
  }
  if (coupon.maxUses != null && Number(coupon.usedCount || 0) >= coupon.maxUses) return "coupon_used_up";
  if (coupon.minSubtotal && Number(subtotal) < coupon.minSubtotal) return "coupon_min";
  return "";
}

export function discountAmount(coupon, subtotal) {
  const sum = Math.max(0, Number(subtotal) || 0);
  if (!coupon || sum <= 0) return 0;
  if (coupon.type === "amount") return Math.min(sum, Math.max(0, Number(coupon.value) || 0));
  const pct = Math.min(100, Math.max(0, Number(coupon.value) || 0));
  return Math.min(sum, Math.floor((sum * pct) / 100));
}
