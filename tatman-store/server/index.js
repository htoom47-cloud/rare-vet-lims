import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { getDb, saveDb, uploadsDir } from "./db.js";
import { stockOf } from "../src/data/stock.js";
import {
  checkPassword,
  clearSessionCookie,
  createSessionCookie,
  isAdmin,
  requireAdmin,
} from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "2mb" }));
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

const ALLOWED_IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return "";
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return ".gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return "";
}

function isSafeImageUrl(url) {
  const s = String(url || "").trim();
  if (!s || s.length > 500) return false;
  if (s.startsWith("/uploads/")) {
    const name = path.basename(s);
    const ext = path.extname(name).toLowerCase();
    return ALLOWED_IMAGE.has(ext) && name === s.slice("/uploads/".length);
  }
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function safeImages(list, primary) {
  const urls = [];
  for (const url of [primary, ...(Array.isArray(list) ? list : [])]) {
    if (!isSafeImageUrl(url)) continue;
    const s = String(url).trim();
    if (!urls.includes(s)) urls.push(s);
  }
  return urls.slice(0, 8);
}

function optionalStock(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function shapeProduct(body, existing = {}) {
  const hasImagePayload = body.image !== undefined || body.images !== undefined;
  const images = hasImagePayload
    ? safeImages(body.images, body.image)
    : safeImages(existing.images, existing.image);
  const availableQa = body.availableQa !== undefined ? body.availableQa : existing.availableQa;
  const availableSa = body.availableSa !== undefined ? body.availableSa : existing.availableSa;
  const active = body.active !== undefined ? body.active : existing.active;
  return {
    ...existing,
    slug: String(body.slug || existing.slug || existing.id || "").trim(),
    nameAr: String(body.nameAr ?? existing.nameAr ?? ""),
    nameEn: String(body.nameEn ?? existing.nameEn ?? ""),
    category: String(body.category || existing.category || "performance"),
    volume: String(body.volume ?? existing.volume ?? ""),
    formAr: String(body.formAr ?? existing.formAr ?? ""),
    formEn: String(body.formEn ?? existing.formEn ?? ""),
    priceQar: Number(body.priceQar ?? existing.priceQar) || 0,
    priceSar: Number(body.priceSar ?? existing.priceSar) || 0,
    accent: body.accent || existing.accent || "#c41e3a",
    secondary: body.secondary || existing.secondary || "#1a4b8c",
    animals: Array.isArray(body.animals) ? body.animals : existing.animals || ["camel", "horse"],
    taglineAr: String(body.taglineAr ?? existing.taglineAr ?? ""),
    taglineEn: String(body.taglineEn ?? existing.taglineEn ?? ""),
    benefitsAr: Array.isArray(body.benefitsAr) ? body.benefitsAr : existing.benefitsAr || [],
    benefitsEn: Array.isArray(body.benefitsEn) ? body.benefitsEn : existing.benefitsEn || [],
    dosageAr: Array.isArray(body.dosageAr) ? body.dosageAr : existing.dosageAr || [],
    dosageEn: Array.isArray(body.dosageEn) ? body.dosageEn : existing.dosageEn || [],
    composition: Array.isArray(body.composition) ? body.composition : existing.composition || [],
    packStyle: body.packStyle || existing.packStyle || "box",
    availableQa: availableQa !== false,
    availableSa: availableSa !== false,
    active: active !== false,
    image: images[0] || "",
    images,
    stockQa: optionalStock(body.stockQa !== undefined ? body.stockQa : existing.stockQa),
    stockSa: optionalStock(body.stockSa !== undefined ? body.stockSa : existing.stockSa),
  };
}

function publicProduct(p) {
  return p;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/catalog", (req, res) => {
  const country = req.query.country === "sa" ? "sa" : "qa";
  const db = getDb();
  const products = db.products.filter((p) => {
    if (p.active === false) return false;
    return country === "sa" ? p.availableSa !== false : p.availableQa !== false;
  });
  res.json({
    country,
    settings: db.settings[country],
    products: products.map(publicProduct),
    categories: [
      { id: "anti-inflammatory", ar: "مضاد التهاب", en: "Anti-inflammatory" },
      { id: "performance", ar: "أداء وتحمل", en: "Performance" },
      { id: "energy", ar: "طاقة وحيوية", en: "Energy" },
      { id: "metabolism", ar: "شهية وتمثيل غذائي", en: "Metabolism" },
      { id: "joints", ar: "مفاصل وأنسجة", en: "Joints" },
      { id: "immunity", ar: "مناعة وحماية", en: "Immunity" },
    ],
  });
});

app.post("/api/orders", (req, res) => {
  const country = req.body?.country === "sa" ? "sa" : "qa";
  const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!itemsIn.length) {
    res.status(400).json({ error: "empty_cart" });
    return;
  }

  const method = String(req.body?.paymentMethod || "whatsapp");
  const customer = {
    name: String(req.body?.customer?.name || "").trim().slice(0, 120),
    phone: String(req.body?.customer?.phone || "").trim().slice(0, 40),
    city: String(req.body?.customer?.city || "").trim().slice(0, 80),
    address: String(req.body?.customer?.address || "").trim().slice(0, 240),
  };
  if (!customer.name || !customer.phone) {
    res.status(400).json({ error: "customer_required" });
    return;
  }

  let order = null;
  let fail = "";
  let settings = null;

  saveDb((d) => {
    settings = d.settings[country];
    const allowed = settings.payments || {};
    const methodOk =
      (method === "whatsapp" && allowed.whatsapp) ||
      (method === "bank" && allowed.bank) ||
      (method === "cod" && allowed.cod) ||
      (method === "card" && allowed.card) ||
      (method === "mada" && allowed.mada);
    if (!methodOk) {
      fail = "payment_disabled";
      return d;
    }

    const lines = [];
    for (const row of itemsIn) {
      const product = d.products.find((p) => p.id === row.id && p.active !== false);
      if (!product) continue;
      if (country === "sa" && product.availableSa === false) continue;
      if (country === "qa" && product.availableQa === false) continue;
      const qty = Math.max(1, Math.min(99, Number(row.qty) || 1));
      const available = stockOf(product, country);
      if (available !== null && available < qty) {
        fail = "insufficient_stock";
        return d;
      }
      const unit = country === "sa" ? product.priceSar : product.priceQar;
      lines.push({
        id: product.id,
        slug: product.slug,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        qty,
        unitPrice: unit,
        lineTotal: unit * qty,
      });
    }

    if (!lines.length) {
      fail = "invalid_items";
      return d;
    }

    for (const line of lines) {
      d.products = d.products.map((p) => {
        if (p.id !== line.id) return p;
        if (country === "sa" && p.stockSa !== null && p.stockSa !== undefined) {
          return { ...p, stockSa: Math.max(0, Number(p.stockSa) - line.qty) };
        }
        if (country === "qa" && p.stockQa !== null && p.stockQa !== undefined) {
          return { ...p, stockQa: Math.max(0, Number(p.stockQa) - line.qty) };
        }
        return p;
      });
    }

    const total = lines.reduce((s, l) => s + l.lineTotal, 0);
    order = {
      id: `TV-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      country,
      currency: settings.currency,
      items: lines,
      total,
      customer,
      paymentMethod: method,
      status: method === "cod" || method === "whatsapp" ? "new" : "pending_payment",
      notes: String(req.body?.notes || "").slice(0, 500),
    };
    d.orders.unshift(order);
    return d;
  });

  if (fail === "payment_disabled") {
    res.status(400).json({ error: fail });
    return;
  }
  if (fail === "insufficient_stock") {
    res.status(409).json({ error: fail });
    return;
  }
  if (fail || !order) {
    res.status(400).json({ error: fail || "invalid_items" });
    return;
  }

  const wa = settings.whatsapp.replace(/\D/g, "");
  const itemLines = order.items.map((l) => `• ${l.nameAr} × ${l.qty}`).join("\n");
  const waText = encodeURIComponent(
    `طلب تطمن ${order.id}\nالدولة: ${settings.nameAr}\n${itemLines}\nالإجمالي: ${order.total} ${settings.currencyAr}\nالدفع: ${method}\nالاسم: ${customer.name}\nالجوال: ${customer.phone}`,
  );

  res.json({
    order,
    whatsappUrl: `https://wa.me/${wa}?text=${waText}`,
    bank:
      method === "bank"
        ? { bankName: settings.bankName, iban: settings.iban, accountName: settings.accountName }
        : null,
  });
});

app.post("/api/admin/login", (req, res) => {
  if (!checkPassword(req.body?.password)) {
    res.status(401).json({ error: "invalid_password" });
    return;
  }
  res.setHeader("Set-Cookie", createSessionCookie());
  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ ok: isAdmin(req) });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({
    productCount: db.products.length,
    orderCount: db.orders.length,
    newOrders: db.orders.filter((o) => o.status === "new" || o.status === "pending_payment").length,
    qaOrders: db.orders.filter((o) => o.country === "qa").length,
    saOrders: db.orders.filter((o) => o.country === "sa").length,
  });
});

app.get("/api/admin/products", requireAdmin, (_req, res) => {
  res.json({ products: getDb().products });
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const id = String(req.body?.id || crypto.randomUUID());
  const product = { ...shapeProduct(req.body || {}, { id }), id };
  if (!product.slug) product.slug = id;
  saveDb((d) => {
    d.products.unshift(product);
    return d;
  });
  res.json({ product });
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  let updated = null;
  saveDb((d) => {
    d.products = d.products.map((p) => {
      if (p.id !== id) return p;
      updated = { ...shapeProduct(req.body || {}, p), id };
      return updated;
    });
    return d;
  });
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ product: updated });
});

app.post(
  "/api/admin/upload",
  requireAdmin,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream"],
    limit: "6mb",
  }),
  (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    const ext = sniffImageExt(buf);
    if (!ext || buf.length < 32) {
      res.status(400).json({ error: "invalid_image" });
      return;
    }
    const name = `${crypto.randomUUID()}${ext}`;
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, name), buf);
    res.json({ url: `/uploads/${name}` });
  },
);

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  saveDb((d) => {
    d.products = d.products.filter((p) => p.id !== req.params.id);
    return d;
  });
  res.json({ ok: true });
});

app.get("/api/admin/orders", requireAdmin, (_req, res) => {
  res.json({ orders: getDb().orders });
});

app.put("/api/admin/orders/:id", requireAdmin, (req, res) => {
  let updated = null;
  saveDb((d) => {
    d.orders = d.orders.map((o) => {
      if (o.id !== req.params.id) return o;
      updated = {
        ...o,
        status: req.body?.status || o.status,
        notes: req.body?.notes ?? o.notes,
      };
      return updated;
    });
    return d;
  });
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ order: updated });
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({ settings: getDb().settings });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const next = saveDb((d) => {
    d.settings = {
      qa: { ...d.settings.qa, ...(req.body?.qa || {}) },
      sa: { ...d.settings.sa, ...(req.body?.sa || {}) },
    };
    return d;
  });
  res.json({ settings: next.settings });
});

const dist = path.join(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Tatman store listening on ${port}`);
});
