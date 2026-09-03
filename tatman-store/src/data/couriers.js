export const COURIER_PRESETS = [
  { id: "pickup", ar: "استلام من المتجر", en: "Store pickup", countries: ["qa", "sa"], trackUrl: "" },
  { id: "aramex", ar: "أرامكس", en: "Aramex", countries: ["qa", "sa"], trackUrl: "https://www.aramex.com/track/results?mode=0&shipmentNumber={code}" },
  { id: "dhl", ar: "DHL", en: "DHL", countries: ["qa", "sa"], trackUrl: "https://www.dhl.com/global-en/home/tracking.html?tracking-id={code}" },
  { id: "fedex", ar: "فيديكس", en: "FedEx", countries: ["qa", "sa"], trackUrl: "https://www.fedex.com/fedextrack/?trknbr={code}" },
  { id: "qatar-post", ar: "بريد قطر", en: "Qatar Post", countries: ["qa"], trackUrl: "" },
  { id: "snoonu", ar: "سنونو", en: "Snoonu", countries: ["qa"], trackUrl: "" },
  { id: "rafeeq", ar: "رفيق", en: "Rafeeq", countries: ["qa"], trackUrl: "" },
  { id: "smsa", ar: "سمسا", en: "SMSA Express", countries: ["sa"], trackUrl: "https://www.smsaexpress.com/trackingdetails?tracknumbers={code}" },
  { id: "spl", ar: "البريد السعودي", en: "SPL", countries: ["sa"], trackUrl: "" },
  { id: "aymakan", ar: "أي مكان", en: "AyMakan", countries: ["sa"], trackUrl: "https://aymakan.com.sa/tracking/{code}" },
];

export function normalizeCourierId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function money(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(99999, Math.round(n * 100) / 100);
}

function kg(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(9999, Math.round(n * 100) / 100);
}

export function shapeCourier(body, existing = {}) {
  const preset = COURIER_PRESETS.find((p) => p.id === (body.id || existing.id));
  const id = normalizeCourierId(body.id ?? existing.id) || `c-${Date.now().toString(36)}`;
  const pricingType = (body.pricingType ?? existing.pricingType) === "weight" ? "weight" : "flat";
  const shippingTypeRaw = body.shippingType ?? existing.shippingType;
  const shippingType =
    shippingTypeRaw === "pickup" || (!shippingTypeRaw && (preset?.id === "pickup" || id === "pickup"))
      ? "pickup"
      : "shipping";
  const codEnabled = (body.codEnabled !== undefined ? body.codEnabled : existing.codEnabled) !== false;
  return {
    id,
    nameAr: String(body.nameAr ?? existing.nameAr ?? preset?.ar ?? "").trim().slice(0, 80),
    nameEn: String(body.nameEn ?? existing.nameEn ?? preset?.en ?? "").trim().slice(0, 80),
    active: (body.active !== undefined ? body.active : existing.active) === true,
    shippingType,
    pricingType,
    merchantFee: money(body.merchantFee ?? existing.merchantFee, 0),
    fee: money(body.fee ?? existing.fee, 0),
    weightKg: kg(body.weightKg ?? existing.weightKg, 0),
    extraCost: money(body.extraCost ?? existing.extraCost, 0),
    extraPerKg: kg(body.extraPerKg ?? existing.extraPerKg, 1),
    etaAr: String(body.etaAr ?? existing.etaAr ?? "").trim().slice(0, 80),
    etaEn: String(body.etaEn ?? existing.etaEn ?? "").trim().slice(0, 80),
    phone: String(body.phone ?? existing.phone ?? "").trim().slice(0, 40),
    trackUrl: String(body.trackUrl ?? existing.trackUrl ?? preset?.trackUrl ?? "").trim().slice(0, 240),
    logo: String(body.logo ?? existing.logo ?? "").trim().slice(0, 240),
    note: String(body.note ?? existing.note ?? "").trim().slice(0, 400),
    overview: String(body.overview ?? existing.overview ?? "").trim().slice(0, 600),
    displayName: String(body.displayName ?? existing.displayName ?? "").trim().slice(0, 80),
    descriptionAr: String(body.descriptionAr ?? existing.descriptionAr ?? "").trim().slice(0, 200),
    descriptionEn: String(body.descriptionEn ?? existing.descriptionEn ?? "").trim().slice(0, 200),
    storeName: String(body.storeName ?? existing.storeName ?? "").trim().slice(0, 80),
    senderName: String(body.senderName ?? existing.senderName ?? "").trim().slice(0, 80),
    senderPhone: String(body.senderPhone ?? existing.senderPhone ?? existing.phone ?? "").trim().slice(0, 40),
    printItemsOnWaybill: (body.printItemsOnWaybill !== undefined ? body.printItemsOnWaybill : existing.printItemsOnWaybill) === true,
    syncStatusFromShipping: (body.syncStatusFromShipping !== undefined ? body.syncStatusFromShipping : existing.syncStatusFromShipping) === true,
    apiEnabled: (body.apiEnabled !== undefined ? body.apiEnabled : existing.apiEnabled) === true,
    apiPassKey: keepSecret(body.apiPassKey, existing.apiPassKey),
    apiUsername: String(body.apiUsername ?? existing.apiUsername ?? "").trim().slice(0, 120),
    apiPassword: keepSecret(body.apiPassword, existing.apiPassword),
    apiAccountNumber: String(body.apiAccountNumber ?? existing.apiAccountNumber ?? "").trim().slice(0, 40),
    apiAccountPin: keepSecret(body.apiAccountPin, existing.apiAccountPin),
    apiAccountEntity: String(body.apiAccountEntity ?? existing.apiAccountEntity ?? "RUH").trim().toUpperCase().slice(0, 8) || "RUH",
    apiProductType: String(body.apiProductType ?? existing.apiProductType ?? "OND").trim().toUpperCase().slice(0, 8) || "OND",
    pickupCity: String(body.pickupCity ?? existing.pickupCity ?? "").trim().slice(0, 80),
    pickupAddress: String(body.pickupAddress ?? existing.pickupAddress ?? "").trim().slice(0, 200),
    codEnabled,
  };
}

function keepSecret(bodyVal, existingVal) {
  const next = bodyVal !== undefined ? String(bodyVal) : "";
  if (next.trim()) return next.trim().slice(0, 160);
  return String(existingVal || "");
}

export function defaultCouriers(country) {
  const code = String(country || "qa");
  const matched = COURIER_PRESETS.filter((p) => p.countries.includes(code));
  const presets = matched.length
    ? matched
    : COURIER_PRESETS.filter((p) => ["pickup", "aramex", "dhl", "fedex"].includes(p.id));
  return presets.map((p) =>
    shapeCourier({
      id: p.id,
      nameAr: p.ar,
      nameEn: p.en,
      trackUrl: p.trackUrl,
      active: false,
      fee: 0,
      shippingType: p.id === "pickup" ? "pickup" : "shipping",
    }),
  );
}

export function mergeCouriers(country, saved, previousList) {
  if (!Array.isArray(saved)) return defaultCouriers(country);
  const prev = new Map((previousList || []).map((c) => [c.id, c]));
  return saved.map((c) => shapeCourier(c, prev.get(c.id) || {})).filter((c) => c.id && (c.nameAr || c.nameEn));
}

export function activeCouriers(list) {
  return (list || []).filter((c) => c.active && c.id);
}

export function findCourier(list, id) {
  const key = normalizeCourierId(id);
  if (!key) return null;
  return (list || []).find((c) => c.id === key) || null;
}

export function trackingLink(courier, trackingNumber) {
  const url = String(courier?.trackUrl || "");
  const code = String(trackingNumber || "").trim();
  if (!url || !code) return "";
  if (!url.includes("{code}")) return url;
  return url.replaceAll("{code}", encodeURIComponent(code));
}

export function courierSupportsCod(courier) {
  if (!courier) return true;
  return courier.codEnabled !== false;
}

export function courierLabel(courier, lang = "ar") {
  if (!courier) return "";
  if (lang === "en") return courier.nameEn || courier.displayName || courier.nameAr || "";
  return courier.displayName || courier.nameAr || courier.nameEn || "";
}

export function isSaudiApiCourier(country, courier) {
  const id = courier?.id || courier;
  return country === "sa" && (id === "smsa" || id === "aramex");
}

export function saudiApiReady(country, courier) {
  if (!isSaudiApiCourier(country, courier) || !courier?.apiEnabled) return false;
  if (courier.id === "smsa") return Boolean(courier.apiPassKey);
  return Boolean(
    courier.apiUsername && courier.apiPassword && courier.apiAccountNumber && courier.apiAccountPin && courier.apiAccountEntity,
  );
}

export function publicStoreCourier(c) {
  if (!c) return c;
  const next = { ...c };
  for (const key of [
    "apiPassKey",
    "apiPassword",
    "apiAccountPin",
    "apiUsername",
    "apiAccountNumber",
    "apiAccountEntity",
    "apiProductType",
    "apiEnabled",
    "pickupCity",
    "pickupAddress",
  ]) {
    delete next[key];
  }
  return next;
}

export function publicAdminCourier(c) {
  const shaped = shapeCourier(c);
  return {
    ...shaped,
    apiPassKeySet: Boolean(c.apiPassKey || shaped.apiPassKey),
    apiPasswordSet: Boolean(c.apiPassword || shaped.apiPassword),
    apiPinSet: Boolean(c.apiAccountPin || shaped.apiAccountPin),
    apiPassKey: "",
    apiPassword: "",
    apiAccountPin: "",
  };
}

const SHIPPING_ERRORS_AR = {
  saudi_only: "الربط متاح للسعودية فقط.",
  already_shipped: "يوجد رقم تتبع مسبقاً ولن يُستبدل.",
  api_not_ready: "أكمل بيانات الربط وفعّله ثم احفظ.",
  carrier_unreachable: "تعذر الاتصال بشركة الشحن.",
  courier_not_found: "شركة التوصيل غير موجودة.",
  not_found: "غير موجود.",
  no_courier: "لا توجد شركة شحن على هذا الطلب.",
  create_failed: "تعذر إنشاء الشحنة.",
  test_failed: "فشل اختبار الاتصال.",
  not_saudi_courier: "هذه الشركة غير مربوطة بواجهة الشحن السعودية.",
};

export function shippingErrorAr(code, detail) {
  if (SHIPPING_ERRORS_AR[code]) return SHIPPING_ERRORS_AR[code];
  const raw = String(detail || code || "").trim();
  if (raw && /[A-Za-z\u0600-\u06FF]/.test(raw) && raw.length <= 240) return raw;
  return "تعذر إتمام العملية.";
}
