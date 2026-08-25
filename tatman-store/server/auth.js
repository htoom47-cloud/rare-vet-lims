import crypto from "node:crypto";

const COOKIE = "tatman_admin";
const TTL_MS = 1000 * 60 * 60 * 12;
const password = process.env.ADMIN_PASSWORD || "Tatman#2026";
const secret = process.env.SESSION_SECRET || "tatman-dev-secret-change-me";

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function checkPassword(input) {
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createSessionCookie() {
  const token = sign({ role: "admin", exp: Date.now() + TTL_MS });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`;
}

export function isAdmin(req) {
  const token = parseCookies(req)[COOKIE];
  return Boolean(verify(token));
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
