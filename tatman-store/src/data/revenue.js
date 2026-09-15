import { ORDER_STATUSES } from "./orders.js";
import { countryCodes, countryLabel, isCountryCode, normalizeCountryCode } from "./countries.js";

export const COUNTED_STATUSES = ["confirmed", "paid", "shipped"];
export const PENDING_STATUSES = ["new", "pending_payment"];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inPeriod(iso, period, now = new Date()) {
  const raw = String(iso || "");
  if (!raw) return period === "all";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return period === "all";
  if (period === "today") {
    return d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }
  if (period === "month") {
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }
  return true;
}

function emptyStatusMap() {
  return Object.fromEntries(ORDER_STATUSES.map(([id]) => [id, { count: 0, total: 0 }]));
}

function orderGross(o) {
  if (o.subtotal != null && o.subtotal !== "") return num(o.subtotal);
  return num(o.total) + num(o.discount);
}

function orderCountry(code) {
  const n = normalizeCountryCode(code);
  if (isCountryCode(n)) return n;
  return "qa";
}

function countryBlock(orders, country, conf) {
  const rows = orders.filter((o) => orderCountry(o.country) === country);
  const counted = rows.filter((o) => COUNTED_STATUSES.includes(o.status || "new"));
  const pending = rows.filter((o) => PENDING_STATUSES.includes(o.status || "new"));
  const cancelled = rows.filter((o) => (o.status || "new") === "cancelled");
  const byStatus = emptyStatusMap();
  const byPayment = {};
  for (const o of rows) {
    const status = ORDER_STATUSES.some(([id]) => id === o.status) ? o.status : "new";
    byStatus[status].count += 1;
    byStatus[status].total += num(o.total);
    const pay = String(o.paymentMethod || "whatsapp");
    if (!byPayment[pay]) byPayment[pay] = { count: 0, total: 0 };
    byPayment[pay].count += 1;
    byPayment[pay].total += num(o.total);
  }
  const products = {};
  for (const o of counted) {
    for (const item of o.items || []) {
      const id = item.id || item.slug || item.nameAr;
      if (!products[id]) products[id] = { id, nameAr: item.nameAr || id, qty: 0, total: 0 };
      products[id].qty += num(item.qty) || 1;
      products[id].total += num(item.lineTotal) || num(item.unitPrice) * (num(item.qty) || 1);
    }
  }
  return {
    country,
    nameAr: conf?.nameAr || countryLabel(country),
    currency: conf?.currency || (country === "sa" ? "SAR" : country === "qa" ? "QAR" : "USD"),
    currencyAr: conf?.currencyAr || (country === "sa" ? "ر.س" : country === "qa" ? "ر.ق" : "$"),
    orderCount: rows.length,
    countedCount: counted.length,
    pendingCount: pending.length,
    cancelledCount: cancelled.length,
    gross: counted.reduce((s, o) => s + orderGross(o), 0),
    discount: counted.reduce((s, o) => s + num(o.discount), 0),
    net: counted.reduce((s, o) => s + num(o.total), 0),
    pendingNet: pending.reduce((s, o) => s + num(o.total), 0),
    cancelledTotal: cancelled.reduce((s, o) => s + num(o.total), 0),
    byStatus,
    byPayment,
    topProducts: Object.values(products)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
  };
}

export function buildRevenue(orders, period = "all", now = new Date(), settings = null) {
  const scoped = (orders || []).filter((o) => inPeriod(o.createdAt, period, now));
  const codes = countryCodes(settings);
  for (const o of scoped) {
    const code = orderCountry(o.country);
    if (!codes.includes(code)) codes.push(code);
  }
  const out = { period };
  for (const code of codes) {
    out[code] = countryBlock(scoped, code, settings?.[code]);
  }
  return out;
}

export function periodLabel(period) {
  if (period === "today") return "اليوم";
  if (period === "month") return "هذا الشهر";
  return "كل الفترة";
}
