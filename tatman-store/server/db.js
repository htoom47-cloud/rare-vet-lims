import fs from "node:fs";
import path from "node:path";
import { products as seedProducts } from "../src/data/products.js";
import { mergeCouriers } from "../src/data/couriers.js";

export const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "store.json");
export const uploadsDir = path.join(dataDir, "uploads");

function optionalStock(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function defaultSettings() {
  return {
    qa: {
      code: "qa",
      nameAr: "قطر",
      nameEn: "Qatar",
      currency: "QAR",
      currencyAr: "ر.ق",
      whatsapp: "97451211169",
      bankName: "",
      iban: "",
      accountName: "Tatman Veterinary Services",
      payments: { whatsapp: true, bank: true, cod: true, card: false, applePay: true },
    },
    sa: {
      code: "sa",
      nameAr: "السعودية",
      nameEn: "Saudi Arabia",
      currency: "SAR",
      currencyAr: "ر.س",
      whatsapp: "97451211169",
      bankName: "",
      iban: "",
      accountName: "Tatman Veterinary Services",
      payments: { whatsapp: true, bank: true, cod: true, mada: false, applePay: true },
    },
  };
}

function normalizeProduct(p) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  if (p.image && !images.includes(p.image)) images.unshift(p.image);
  return {
    ...p,
    priceSar: Number(p.priceSar ?? Math.round(Number(p.priceQar) * 1.03)),
    availableQa: p.availableQa !== false,
    availableSa: p.availableSa !== false,
    active: p.active !== false,
    image: images[0] || "",
    images,
    stockQa: optionalStock(p.stockQa),
    stockSa: optionalStock(p.stockSa),
  };
}

function emptyDb() {
  return {
    products: seedProducts.map(normalizeProduct),
    orders: [],
    coupons: [],
    adminUsers: [],
    settings: defaultSettings(),
  };
}

function ensure() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(emptyDb(), null, 2));
  }
}

function mergeCountrySettings(code, saved) {
  const base = defaultSettings()[code];
  const row = saved?.[code] || {};
  return {
    ...base,
    ...row,
    payments: { ...base.payments, ...(row.payments || {}) },
    couriers: mergeCouriers(code, row.couriers),
  };
}

function read() {
  ensure();
  const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  raw.products = (raw.products || []).map(normalizeProduct);
  raw.settings = {
    qa: mergeCountrySettings("qa", raw.settings),
    sa: mergeCountrySettings("sa", raw.settings),
  };
  raw.orders = raw.orders || [];
  raw.coupons = Array.isArray(raw.coupons) ? raw.coupons : [];
  raw.adminUsers = Array.isArray(raw.adminUsers) ? raw.adminUsers : [];
  return raw;
}

function write(db) {
  ensure();
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

export function getDb() {
  return read();
}

export function saveDb(mutator) {
  const db = read();
  const next = mutator(db) || db;
  write(next);
  return next;
}
