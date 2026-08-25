import fs from "node:fs";
import path from "node:path";
import { products as seedProducts } from "../src/data/products.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "store.json");

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
      payments: { whatsapp: true, bank: true, cod: true, card: false },
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
      payments: { whatsapp: true, bank: true, cod: true, mada: false },
    },
  };
}

function normalizeProduct(p) {
  return {
    ...p,
    priceSar: Number(p.priceSar ?? Math.round(Number(p.priceQar) * 1.03)),
    availableQa: p.availableQa !== false,
    availableSa: p.availableSa !== false,
    active: p.active !== false,
  };
}

function emptyDb() {
  return {
    products: seedProducts.map(normalizeProduct),
    orders: [],
    settings: defaultSettings(),
  };
}

function ensure() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(emptyDb(), null, 2));
  }
}

function read() {
  ensure();
  const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  raw.products = (raw.products || []).map(normalizeProduct);
  raw.settings = { ...defaultSettings(), ...(raw.settings || {}) };
  raw.settings.qa = { ...defaultSettings().qa, ...(raw.settings.qa || {}) };
  raw.settings.sa = { ...defaultSettings().sa, ...(raw.settings.sa || {}) };
  raw.orders = raw.orders || [];
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
