import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { getDb, saveDb } from "./db.js";
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
  const db = getDb();
  const settings = db.settings[country];
  const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!itemsIn.length) {
    res.status(400).json({ error: "empty_cart" });
    return;
  }

  const lines = [];
  for (const row of itemsIn) {
    const product = db.products.find((p) => p.id === row.id && p.active !== false);
    if (!product) continue;
    if (country === "sa" && product.availableSa === false) continue;
    if (country === "qa" && product.availableQa === false) continue;
    const qty = Math.max(1, Math.min(99, Number(row.qty) || 1));
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
    res.status(400).json({ error: "invalid_items" });
    return;
  }

  const method = String(req.body?.paymentMethod || "whatsapp");
  const allowed = settings.payments || {};
  const methodOk =
    (method === "whatsapp" && allowed.whatsapp) ||
    (method === "bank" && allowed.bank) ||
    (method === "cod" && allowed.cod) ||
    (method === "card" && allowed.card) ||
    (method === "mada" && allowed.mada);
  if (!methodOk) {
    res.status(400).json({ error: "payment_disabled" });
    return;
  }

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

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const order = {
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

  saveDb((d) => {
    d.orders.unshift(order);
    return d;
  });

  const wa = settings.whatsapp.replace(/\D/g, "");
  const itemLines = lines.map((l) => `• ${l.nameAr} × ${l.qty}`).join("\n");
  const waText = encodeURIComponent(
    `طلب تطمن ${order.id}\nالدولة: ${settings.nameAr}\n${itemLines}\nالإجمالي: ${total} ${settings.currencyAr}\nالدفع: ${method}\nالاسم: ${customer.name}\nالجوال: ${customer.phone}`,
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
  const p = req.body || {};
  const id = String(p.id || crypto.randomUUID());
  const product = {
    id,
    slug: String(p.slug || id).trim(),
    nameAr: String(p.nameAr || ""),
    nameEn: String(p.nameEn || ""),
    category: String(p.category || "performance"),
    volume: String(p.volume || ""),
    formAr: String(p.formAr || ""),
    formEn: String(p.formEn || ""),
    priceQar: Number(p.priceQar) || 0,
    priceSar: Number(p.priceSar) || 0,
    accent: p.accent || "#c41e3a",
    secondary: p.secondary || "#1a4b8c",
    animals: Array.isArray(p.animals) ? p.animals : ["camel", "horse"],
    taglineAr: String(p.taglineAr || ""),
    taglineEn: String(p.taglineEn || ""),
    benefitsAr: Array.isArray(p.benefitsAr) ? p.benefitsAr : [],
    benefitsEn: Array.isArray(p.benefitsEn) ? p.benefitsEn : [],
    dosageAr: Array.isArray(p.dosageAr) ? p.dosageAr : [],
    dosageEn: Array.isArray(p.dosageEn) ? p.dosageEn : [],
    composition: Array.isArray(p.composition) ? p.composition : [],
    packStyle: p.packStyle || "box",
    availableQa: p.availableQa !== false,
    availableSa: p.availableSa !== false,
    active: p.active !== false,
  };
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
      updated = { ...p, ...req.body, id };
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
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Tatman store listening on ${port}`);
});
