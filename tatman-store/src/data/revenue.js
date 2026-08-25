import { ORDER_STATUSES } from "./orders.js";

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

function countryBlock(orders, country) {
  const rows = orders.filter((o) => (o.country === "sa" ? "sa" : "qa") === country);
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
    currency: country === "sa" ? "SAR" : "QAR",
    currencyAr: country === "sa" ? "ر.س" : "ر.ق",
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

export function buildRevenue(orders, period = "all", now = new Date()) {
  const scoped = (orders || []).filter((o) => inPeriod(o.createdAt, period, now));
  return {
    period,
    qa: countryBlock(scoped, "qa"),
    sa: countryBlock(scoped, "sa"),
  };
}

export function periodLabel(period) {
  if (period === "today") return "اليوم";
  if (period === "month") return "هذا الشهر";
  return "كل الفترة";
}
