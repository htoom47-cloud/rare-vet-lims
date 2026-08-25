export const ORDER_STATUSES = [
  ["new", "جديد"],
  ["pending_payment", "بانتظار الدفع"],
  ["confirmed", "مؤكد"],
  ["paid", "مدفوع"],
  ["shipped", "تم الشحن"],
  ["cancelled", "ملغى"],
];

export function isOrderStatus(value) {
  return ORDER_STATUSES.some(([id]) => id === value);
}

export function statusLabel(value) {
  const row = ORDER_STATUSES.find(([id]) => id === value);
  return row ? row[1] : "جديد";
}

export function countryLabel(code) {
  return code === "sa" ? "السعودية" : "قطر";
}
