import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { getDb, saveDb, uploadsDir } from "./db.js";
import { decrementStock, stockOf } from "../src/data/stock.js";
import { couponFail, discountAmount, findCoupon, normalizeCode, shapeCoupon } from "../src/data/coupons.js";
import { customersFromOrders } from "../src/data/customers.js";
import { isOrderStatus } from "../src/data/orders.js";
import { activeCouriers, findCourier, publicAdminCourier, publicStoreCourier, saudiApiReady } from "../src/data/couriers.js";
import { buildRevenue } from "../src/data/revenue.js";
import { createSaudiShipment, testSaudiCourier } from "./shipping.js";
import {
  isCountryCode,
  mergeAllSettings,
  normalizeCountryCode,
  productAvailable,
  productPrice,
  publicCountryList,
  resolveCountry,
  shapeExtraAvailable,
  shapeExtraPrices,
  shapeExtraStock,
} from "../src/data/countries.js";
import { normalizePermissions, normalizeUsername, publicAdminUser } from "../src/data/permissions.js";
import {
  checkPassword,
  clearSessionCookie,
  createSessionCookie,
  getSessionUser,
  hashPassword,
  requireAdmin,
  requirePermission,
  systemOwner,
  verifyStoredPassword,
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
    prices: shapeExtraPrices(body.prices, existing.prices),
    available: shapeExtraAvailable(body.available, existing.available),
    stock: shapeExtraStock(body.stock, existing.stock, optionalStock),
  };
}

function publicProduct(p) {
  return p;
}

function publicCountrySettings(s) {
  if (!s) return s;
  return {
    ...s,
    couriers: (s.couriers || []).map(publicStoreCourier),
  };
}

function publicAdminSettings(settings) {
  const out = {};
  for (const [code, conf] of Object.entries(settings || {})) {
    out[code] = {
      ...conf,
      couriers: (conf.couriers || []).map(publicAdminCourier),
    };
  }
  return out;
}

function publicOrder(order, settings) {
  const courier = findCourier(settings?.[order.country]?.couriers, order.shipping?.id);
  return {
    ...order,
    canCreateShipment: order.country === "sa" && saudiApiReady("sa", courier) && !order.trackingNumber,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/catalog", (req, res) => {
  const db = getDb();
  const country = resolveCountry(req.query.country, db.settings);
  const products = db.products.filter((p) => {
    if (p.active === false) return false;
    return productAvailable(p, country);
  });
  res.json({
    country,
    settings: publicCountrySettings(db.settings[country]),
    countries: publicCountryList(db.settings),
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
    const country = resolveCountry(req.body?.country, d.settings);
    settings = d.settings[country];
    if (!settings) {
      fail = "invalid_country";
      return d;
    }
    const allowed = settings.payments || {};
    const methodOk =
      (method === "whatsapp" && allowed.whatsapp) ||
      (method === "bank" && allowed.bank) ||
      (method === "cod" && allowed.cod) ||
      (method === "card" && allowed.card) ||
      (method === "mada" && allowed.mada) ||
      (method === "applePay" && allowed.applePay);
    if (!methodOk) {
      fail = "payment_disabled";
      return d;
    }

    const lines = [];
    for (const row of itemsIn) {
      const product = d.products.find((p) => p.id === row.id && p.active !== false);
      if (!product) continue;
      if (!productAvailable(product, country)) continue;
      const qty = Math.max(1, Math.min(99, Number(row.qty) || 1));
      const available = stockOf(product, country);
      if (available !== null && available < qty) {
        fail = "insufficient_stock";
        return d;
      }
      const unit = productPrice(product, country);
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

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const requestedCode = normalizeCode(req.body?.couponCode);
    let coupon = null;
    let discount = 0;
    if (requestedCode) {
      coupon = findCoupon(d.coupons, requestedCode);
      fail = couponFail(coupon, { country, subtotal });
      if (fail) return d;
      discount = discountAmount(coupon, subtotal);
    }

    const availableCouriers = activeCouriers(settings.couriers);
    let shipping = null;
    if (availableCouriers.length) {
      const chosen = findCourier(availableCouriers, req.body?.shippingId);
      if (!chosen) {
        fail = "shipping_required";
        return d;
      }
      shipping = {
        id: chosen.id,
        nameAr: chosen.nameAr,
        nameEn: chosen.nameEn,
        fee: Number(chosen.fee) || 0,
        trackUrl: chosen.trackUrl || "",
      };
    }

    for (const line of lines) {
      d.products = d.products.map((p) => (p.id === line.id ? decrementStock(p, country, line.qty) : p));
    }

    if (coupon) {
      d.coupons = (d.coupons || []).map((c) =>
        c.id === coupon.id ? { ...c, usedCount: Math.max(0, Number(c.usedCount) || 0) + 1 } : c,
      );
    }

    const shippingFee = shipping ? Number(shipping.fee) || 0 : 0;
    const total = Math.max(0, subtotal - discount) + shippingFee;
    order = {
      id: `TV-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      country,
      currency: settings.currency,
      items: lines,
      subtotal,
      discount,
      couponCode: coupon ? coupon.code : "",
      shipping,
      shippingFee,
      trackingNumber: "",
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
  if (fail && String(fail).startsWith("coupon_")) {
    res.status(400).json({ error: fail });
    return;
  }
  if (fail === "shipping_required") {
    res.status(400).json({ error: fail });
    return;
  }
  if (fail || !order) {
    res.status(400).json({ error: fail || "invalid_items" });
    return;
  }

  const methodAr =
    {
      whatsapp: "واتساب",
      bank: "تحويل بنكي",
      cod: "الدفع عند الاستلام",
      card: "بطاقة",
      mada: "مدى",
      applePay: "أبل باي",
    }[method] || method;
  const wa = settings.whatsapp.replace(/\D/g, "");
  const itemLines = order.items.map((l) => `• ${l.nameAr} × ${l.qty}`).join("\n");
  const discountLine = order.discount
    ? `\nالخصم (${order.couponCode}): -${order.discount} ${settings.currencyAr}`
    : "";
  const shipLine = order.shipping
    ? `\nالتوصيل: ${order.shipping.nameAr}${order.shippingFee ? `\nرسوم التوصيل: ${order.shippingFee} ${settings.currencyAr}` : ""}`
    : "";
  const waText = encodeURIComponent(
    `طلب تطمن ${order.id}\nالدولة: ${settings.nameAr}\n${itemLines}${discountLine}${shipLine}\nالإجمالي: ${order.total} ${settings.currencyAr}\nالدفع: ${methodAr}\nالاسم: ${customer.name}\nالجوال: ${customer.phone}`,
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
  const username = normalizeUsername(req.body?.username);
  const pass = String(req.body?.password || "");
  if (username) {
    const user = (getDb().adminUsers || []).find((u) => u.username === username);
    if (user && user.active !== false && verifyStoredPassword(pass, user)) {
      res.setHeader("Set-Cookie", createSessionCookie({ uid: user.id }));
      res.json({ ok: true, user: publicAdminUser(user) });
      return;
    }
  }
  if ((!username || username === "admin") && checkPassword(pass)) {
    res.setHeader("Set-Cookie", createSessionCookie({ isOwner: true }));
    res.json({ ok: true, user: systemOwner() });
    return;
  }
  res.status(401).json({ error: "invalid_password" });
});

app.post("/api/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const user = getSessionUser(req);
  res.json({ ok: Boolean(user), user });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const db = getDb();
  res.json({
    productCount: db.products.length,
    orderCount: db.orders.length,
    newOrders: db.orders.filter((o) => o.status === "new" || o.status === "pending_payment").length,
    qaOrders: db.orders.filter((o) => o.country === "qa").length,
    saOrders: db.orders.filter((o) => o.country === "sa").length,
    couponCount: (db.coupons || []).length,
    customerCount: customersFromOrders(db.orders || []).length,
  });
});

app.post("/api/coupons/preview", (req, res) => {
  const country = resolveCountry(req.body?.country, getDb().settings);
  const subtotal = Math.max(0, Number(req.body?.subtotal) || 0);
  const coupon = findCoupon(getDb().coupons, req.body?.code);
  const fail = couponFail(coupon, { country, subtotal });
  if (fail) {
    res.status(400).json({ error: fail });
    return;
  }
  const discount = discountAmount(coupon, subtotal);
  res.json({
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discount,
    total: Math.max(0, subtotal - discount),
    minSubtotal: coupon.minSubtotal || 0,
  });
});

app.get("/api/admin/coupons", requirePermission("coupons"), (_req, res) => {
  const db = getDb();
  res.json({ coupons: db.coupons || [], countries: publicCountryList(db.settings) });
});

app.post("/api/admin/coupons", requirePermission("coupons"), (req, res) => {
  const coupon = shapeCoupon(req.body || {}, { id: crypto.randomUUID(), usedCount: 0 });
  if (!coupon.code) {
    res.status(400).json({ error: "code_required" });
    return;
  }
  const db = getDb();
  if (findCoupon(db.coupons, coupon.code)) {
    res.status(409).json({ error: "code_exists" });
    return;
  }
  saveDb((d) => {
    d.coupons = d.coupons || [];
    d.coupons.unshift(coupon);
    return d;
  });
  res.json({ coupon });
});

app.put("/api/admin/coupons/:id", requirePermission("coupons"), (req, res) => {
  const id = req.params.id;
  let updated = null;
  let clash = false;
  saveDb((d) => {
    const current = (d.coupons || []).find((c) => c.id === id);
    if (!current) return d;
    const next = { ...shapeCoupon(req.body || {}, current), id, usedCount: current.usedCount };
    if (!next.code) return d;
    clash = (d.coupons || []).some((c) => c.id !== id && normalizeCode(c.code) === next.code);
    if (clash) return d;
    updated = next;
    d.coupons = d.coupons.map((c) => (c.id === id ? next : c));
    return d;
  });
  if (clash) {
    res.status(409).json({ error: "code_exists" });
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ coupon: updated });
});

app.delete("/api/admin/coupons/:id", requirePermission("coupons"), (req, res) => {
  saveDb((d) => {
    d.coupons = (d.coupons || []).filter((c) => c.id !== req.params.id);
    return d;
  });
  res.json({ ok: true });
});

app.get("/api/admin/products", requirePermission("products"), (_req, res) => {
  const db = getDb();
  res.json({ products: db.products, countries: publicCountryList(db.settings) });
});

app.post("/api/admin/products", requirePermission("products"), (req, res) => {
  const id = String(req.body?.id || crypto.randomUUID());
  const product = { ...shapeProduct(req.body || {}, { id }), id };
  if (!product.slug) product.slug = id;
  saveDb((d) => {
    d.products.unshift(product);
    return d;
  });
  res.json({ product });
});

app.put("/api/admin/products/:id", requirePermission("products"), (req, res) => {
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
  requirePermission("products"),
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

app.delete("/api/admin/products/:id", requirePermission("products"), (req, res) => {
  saveDb((d) => {
    d.products = d.products.filter((p) => p.id !== req.params.id);
    return d;
  });
  res.json({ ok: true });
});

app.get("/api/admin/orders", requirePermission("orders"), (_req, res) => {
  const db = getDb();
  res.json({
    orders: (db.orders || []).map((o) => publicOrder(o, db.settings)),
    countries: publicCountryList(db.settings),
  });
});

app.get("/api/admin/customers", requirePermission("customers"), (_req, res) => {
  const db = getDb();
  res.json({ customers: customersFromOrders(db.orders || []), countries: publicCountryList(db.settings) });
});

app.put("/api/admin/orders/:id", requirePermission("orders"), (req, res) => {
  if (req.body?.status !== undefined && !isOrderStatus(req.body.status)) {
    res.status(400).json({ error: "invalid_status" });
    return;
  }
  let updated = null;
  saveDb((d) => {
    d.orders = d.orders.map((o) => {
      if (o.id !== req.params.id) return o;
      updated = {
        ...o,
        status: req.body?.status || o.status || "new",
        notes: req.body?.notes ?? o.notes,
        trackingNumber:
          req.body?.trackingNumber !== undefined
            ? String(req.body.trackingNumber || "").trim().slice(0, 80)
            : o.trackingNumber || "",
      };
      return updated;
    });
    return d;
  });
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ order: publicOrder(updated, getDb().settings) });
});

app.post("/api/admin/orders/:id/shipment", requirePermission("orders"), async (req, res) => {
  const db = getDb();
  const order = (db.orders || []).find((o) => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (order.country !== "sa") {
    res.status(400).json({ error: "saudi_only" });
    return;
  }
  if (order.trackingNumber) {
    res.status(409).json({ error: "already_shipped" });
    return;
  }
  const courier = findCourier(db.settings.sa?.couriers, order.shipping?.id);
  if (!courier) {
    res.status(400).json({ error: "no_courier" });
    return;
  }
  try {
    const result = await createSaudiShipment(order, courier);
    if (!result.ok) {
      res.status(400).json({ error: result.error || "create_failed" });
      return;
    }
    let updated = null;
    let conflict = false;
    saveDb((d) => {
      const current = (d.orders || []).find((o) => o.id === order.id);
      if (!current) return d;
      if (current.trackingNumber) {
        conflict = true;
        updated = current;
        return d;
      }
      updated = {
        ...current,
        trackingNumber: result.trackingNumber,
        shippingLabelUrl: result.labelUrl || current.shippingLabelUrl || "",
      };
      d.orders = d.orders.map((o) => (o.id === order.id ? updated : o));
      return d;
    });
    if (conflict) {
      res.status(409).json({ error: "already_shipped" });
      return;
    }
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      order: publicOrder(updated, getDb().settings),
      trackingNumber: result.trackingNumber,
      shippingLabelUrl: updated.shippingLabelUrl || "",
    });
  } catch {
    res.status(502).json({ error: "carrier_unreachable" });
  }
});

app.get("/api/admin/revenue", requirePermission("revenue"), (req, res) => {
  const period = req.query.period === "today" || req.query.period === "month" ? req.query.period : "all";
  const db = getDb();
  res.json(buildRevenue(db.orders || [], period, new Date(), db.settings));
});

function shapeAdminUser(body, existing = {}) {
  const username = normalizeUsername(body.username ?? existing.username);
  if (!username || username.length < 3) return { error: "username_required" };
  if (username === "admin") return { error: "username_reserved" };
  const name = String(body.name ?? existing.name ?? username).trim().slice(0, 80);
  const next = {
    id: existing.id || crypto.randomUUID(),
    username,
    name: name || username,
    active: (body.active !== undefined ? body.active : existing.active) !== false,
    permissions: normalizePermissions(body.permissions !== undefined ? body.permissions : existing.permissions),
    passwordHash: existing.passwordHash || "",
    passwordSalt: existing.passwordSalt || "",
    createdAt: existing.createdAt || new Date().toISOString(),
  };
  const pass = body.password !== undefined ? String(body.password) : "";
  if (pass) {
    if (pass.length < 8) return { error: "password_short" };
    Object.assign(next, hashPassword(pass));
  }
  if (!existing.id && !pass) return { error: "password_required" };
  if (!next.passwordHash) return { error: "password_required" };
  return { user: next };
}

app.get("/api/admin/users", requirePermission("users"), (_req, res) => {
  res.json({ users: (getDb().adminUsers || []).map((u) => publicAdminUser(u)) });
});

app.post("/api/admin/users", requirePermission("users"), (req, res) => {
  const shaped = shapeAdminUser(req.body || {});
  if (shaped.error) {
    res.status(400).json({ error: shaped.error });
    return;
  }
  const db = getDb();
  if ((db.adminUsers || []).some((u) => u.username === shaped.user.username)) {
    res.status(409).json({ error: "username_exists" });
    return;
  }
  saveDb((d) => {
    d.adminUsers = d.adminUsers || [];
    d.adminUsers.unshift(shaped.user);
    return d;
  });
  res.json({ user: publicAdminUser(shaped.user) });
});

app.put("/api/admin/users/:id", requirePermission("users"), (req, res) => {
  const id = req.params.id;
  let updated = null;
  let clash = false;
  let shapedError = "";
  saveDb((d) => {
    const current = (d.adminUsers || []).find((u) => u.id === id);
    if (!current) return d;
    const shaped = shapeAdminUser(req.body || {}, current);
    if (shaped.error) {
      shapedError = shaped.error;
      return d;
    }
    clash = (d.adminUsers || []).some((u) => u.id !== id && u.username === shaped.user.username);
    if (clash) return d;
    updated = { ...shaped.user, id };
    d.adminUsers = d.adminUsers.map((u) => (u.id === id ? updated : u));
    return d;
  });
  if (shapedError) {
    res.status(400).json({ error: shapedError });
    return;
  }
  if (clash) {
    res.status(409).json({ error: "username_exists" });
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ user: publicAdminUser(updated) });
});

app.delete("/api/admin/users/:id", requirePermission("users"), (req, res) => {
  const me = getSessionUser(req);
  if (me?.id === req.params.id) {
    res.status(400).json({ error: "cannot_delete_self" });
    return;
  }
  saveDb((d) => {
    d.adminUsers = (d.adminUsers || []).filter((u) => u.id !== req.params.id);
    return d;
  });
  res.json({ ok: true });
});

app.get("/api/admin/settings", requirePermission("settings"), (_req, res) => {
  res.json({ settings: publicAdminSettings(getDb().settings) });
});

app.put("/api/admin/settings", requirePermission("settings"), (req, res) => {
  const incoming = req.body && typeof req.body === "object" ? req.body : {};
  const next = saveDb((d) => {
    const nextRaw = {
      qa: incoming.qa || d.settings.qa,
      sa: incoming.sa || d.settings.sa,
    };
    for (const [key, conf] of Object.entries(incoming)) {
      const code = normalizeCountryCode(key);
      if (!isCountryCode(code) || code === "qa" || code === "sa") continue;
      nextRaw[code] = conf;
    }
    d.settings = mergeAllSettings(nextRaw, d.settings);
    return d;
  });
  res.json({ settings: publicAdminSettings(next.settings) });
});

app.post("/api/admin/shipping/test", requirePermission("settings"), async (req, res) => {
  if (String(req.body?.country || "").trim().toLowerCase() !== "sa") {
    res.status(400).json({ error: "saudi_only" });
    return;
  }
  const courier = findCourier(getDb().settings.sa?.couriers, req.body?.courierId);
  if (!courier) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!saudiApiReady("sa", { ...courier, apiEnabled: true })) {
    res.status(400).json({ error: "api_not_ready" });
    return;
  }
  try {
    const result = await testSaudiCourier(courier);
    if (!result.ok) {
      res.status(400).json({ error: result.error || "test_failed" });
      return;
    }
    res.json({ ok: true, message: result.message });
  } catch {
    res.status(502).json({ error: "carrier_unreachable" });
  }
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
