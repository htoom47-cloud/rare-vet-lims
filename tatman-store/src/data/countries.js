import { mergeCouriers } from "./couriers.js";

export const CORE_COUNTRY_CODES = ["qa", "sa"];

export const COUNTRY_PRESETS = {
  qa: { nameAr: "قطر", nameEn: "Qatar", currency: "QAR", currencyAr: "ر.ق" },
  sa: { nameAr: "السعودية", nameEn: "Saudi Arabia", currency: "SAR", currencyAr: "ر.س" },
  ae: { nameAr: "الإمارات", nameEn: "UAE", currency: "AED", currencyAr: "د.إ" },
  kw: { nameAr: "الكويت", nameEn: "Kuwait", currency: "KWD", currencyAr: "د.ك" },
  bh: { nameAr: "البحرين", nameEn: "Bahrain", currency: "BHD", currencyAr: "د.ب" },
  om: { nameAr: "عُمان", nameEn: "Oman", currency: "OMR", currencyAr: "ر.ع" },
  eg: { nameAr: "مصر", nameEn: "Egypt", currency: "EGP", currencyAr: "ج.م" },
  jo: { nameAr: "الأردن", nameEn: "Jordan", currency: "JOD", currencyAr: "د.أ" },
};

export const FALLBACK_COUNTRIES = [
  { code: "qa", ...COUNTRY_PRESETS.qa },
  { code: "sa", ...COUNTRY_PRESETS.sa },
];

export function normalizeCountryCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 3);
}

export function isCountryCode(code) {
  return /^[a-z]{2,3}$/.test(code);
}

export function isCoreCountry(code) {
  return code === "qa" || code === "sa";
}

export function normalizeCurrency(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
}

export function paymentKeysFor(code) {
  if (code === "sa") return ["whatsapp", "bank", "cod", "mada", "applePay"];
  return ["whatsapp", "bank", "cod", "card", "applePay"];
}

function defaultPayments(code) {
  if (code === "sa") return { whatsapp: true, bank: true, cod: true, mada: false, applePay: true };
  return { whatsapp: true, bank: true, cod: true, card: false, applePay: true };
}

export function defaultCountryRow(code, extra = {}) {
  const preset = COUNTRY_PRESETS[code] || {};
  const currency = normalizeCurrency(extra.currency || preset.currency) || "USD";
  return {
    code,
    nameAr: String(extra.nameAr || preset.nameAr || code.toUpperCase()).trim().slice(0, 80),
    nameEn: String(extra.nameEn || preset.nameEn || code.toUpperCase()).trim().slice(0, 80),
    currency,
    currencyAr: String(extra.currencyAr || preset.currencyAr || currency).trim().slice(0, 12),
    whatsapp: String(extra.whatsapp || "97451211169").trim().slice(0, 20),
    bankName: String(extra.bankName || "").slice(0, 80),
    iban: String(extra.iban || "").slice(0, 40),
    accountName: String(extra.accountName || "Tatman Veterinary Services").slice(0, 80),
    payments: { ...defaultPayments(code), ...(extra.payments || {}) },
  };
}

export function mergeCountrySettings(code, savedRow) {
  const base = defaultCountryRow(code);
  const row = savedRow && typeof savedRow === "object" ? savedRow : {};
  return {
    ...base,
    ...row,
    code,
    nameAr: String(row.nameAr || base.nameAr).trim().slice(0, 80) || base.nameAr,
    nameEn: String(row.nameEn || base.nameEn).trim().slice(0, 80) || base.nameEn,
    currency: normalizeCurrency(row.currency || base.currency) || base.currency,
    currencyAr: String(row.currencyAr || base.currencyAr).trim().slice(0, 12) || base.currencyAr,
    whatsapp: String(row.whatsapp ?? base.whatsapp).trim().slice(0, 20) || base.whatsapp,
    bankName: String(row.bankName ?? base.bankName).slice(0, 80),
    iban: String(row.iban ?? base.iban).slice(0, 40),
    accountName: String(row.accountName ?? base.accountName).slice(0, 80),
    payments: { ...base.payments, ...(row.payments || {}) },
    couriers: mergeCouriers(code, row.couriers),
  };
}

export function mergeAllSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {
    qa: mergeCountrySettings("qa", src.qa),
    sa: mergeCountrySettings("sa", src.sa),
  };
  for (const [key, conf] of Object.entries(src)) {
    const code = normalizeCountryCode(key);
    if (!isCountryCode(code) || isCoreCountry(code)) continue;
    out[code] = mergeCountrySettings(code, conf);
  }
  return out;
}

export function countryCodes(settings) {
  const codes = ["qa", "sa"];
  const src = settings && typeof settings === "object" ? settings : {};
  for (const key of Object.keys(src)) {
    const code = normalizeCountryCode(key);
    if (!isCountryCode(code) || codes.includes(code)) continue;
    codes.push(code);
  }
  return codes;
}

export function extraCountryCodes(settings) {
  return countryCodes(settings).filter((code) => !isCoreCountry(code));
}

export function publicCountryList(settings) {
  return countryCodes(settings).map((code) => {
    const row = settings?.[code] || {};
    const preset = COUNTRY_PRESETS[code] || {};
    return {
      code,
      nameAr: row.nameAr || preset.nameAr || code.toUpperCase(),
      nameEn: row.nameEn || preset.nameEn || code.toUpperCase(),
      currency: row.currency || preset.currency || "USD",
      currencyAr: row.currencyAr || preset.currencyAr || row.currency || "$",
    };
  });
}

export function countryLabel(code, settings) {
  const n = normalizeCountryCode(code);
  if (settings?.[n]?.nameAr) return settings[n].nameAr;
  if (COUNTRY_PRESETS[n]?.nameAr) return COUNTRY_PRESETS[n].nameAr;
  return n ? n.toUpperCase() : "قطر";
}

export function resolveCountry(raw, settings) {
  const code = normalizeCountryCode(raw);
  if (code && settings?.[code]) return code;
  return "qa";
}

export function productPrice(product, country) {
  if (!product) return 0;
  if (country === "sa") return Number(product.priceSar || product.priceQar || 0) || 0;
  if (country === "qa") return Number(product.priceQar || 0) || 0;
  const n = Number(product.prices?.[country]);
  if (Number.isFinite(n) && n > 0) return n;
  return Number(product.priceQar || 0) || 0;
}

export function productAvailable(product, country) {
  if (!product) return false;
  if (country === "sa") return product.availableSa !== false;
  if (country === "qa") return product.availableQa !== false;
  if (product.available && typeof product.available[country] === "boolean") return product.available[country];
  return true;
}

function extraKey(code) {
  const n = normalizeCountryCode(code);
  return isCountryCode(n) && !isCoreCountry(n) ? n : "";
}

export function shapeExtraPrices(bodyMap, existingMap) {
  const src = { ...(existingMap && typeof existingMap === "object" ? existingMap : {}) };
  if (bodyMap && typeof bodyMap === "object") Object.assign(src, bodyMap);
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    const code = extraKey(key);
    if (!code) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) out[code] = n;
  }
  return out;
}

export function shapeExtraAvailable(bodyMap, existingMap) {
  const src = { ...(existingMap && typeof existingMap === "object" ? existingMap : {}) };
  if (bodyMap && typeof bodyMap === "object") Object.assign(src, bodyMap);
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    const code = extraKey(key);
    if (!code) continue;
    out[code] = value !== false;
  }
  return out;
}

export function shapeExtraStock(bodyMap, existingMap, optionalStock) {
  const src = { ...(existingMap && typeof existingMap === "object" ? existingMap : {}) };
  if (bodyMap && typeof bodyMap === "object") Object.assign(src, bodyMap);
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    const code = extraKey(key);
    if (!code) continue;
    const n = optionalStock(value);
    if (n !== null) out[code] = n;
  }
  return out;
}
