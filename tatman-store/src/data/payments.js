export const PAYMENT_METHODS = [
  { id: "whatsapp", ar: "واتساب", en: "WhatsApp" },
  { id: "bank", ar: "تحويل بنكي", en: "Bank transfer" },
  { id: "cod", ar: "الدفع عند الاستلام", en: "Cash on delivery" },
  { id: "card", ar: "بطاقة ائتمان / مدى", en: "Card / Mada" },
  { id: "mada", ar: "مدى", en: "Mada" },
  { id: "applePay", ar: "أبل باي", en: "Apple Pay" },
];

export function paymentLabel(id, lang = "ar") {
  const row = PAYMENT_METHODS.find((m) => m.id === id);
  if (!row) return id || "";
  return lang === "en" ? row.en : row.ar;
}

export function checkoutMethods(payments = {}) {
  const enabled = [];
  if (payments.whatsapp) enabled.push({ id: "whatsapp", ar: "واتساب", en: "WhatsApp" });
  if (payments.bank) enabled.push({ id: "bank", ar: "تحويل بنكي", en: "Bank transfer" });
  if (payments.cod) enabled.push({ id: "cod", ar: "الدفع عند الاستلام", en: "Cash on delivery" });
  if (payments.card || payments.mada) {
    enabled.push({ id: payments.mada && !payments.card ? "mada" : "card", ar: "بطاقة ائتمان / مدى", en: "Card / Mada" });
  }
  if (payments.applePay) enabled.push({ id: "applePay", ar: "أبل باي", en: "Apple Pay" });
  return enabled;
}
