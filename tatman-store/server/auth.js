import crypto from "node:crypto";
import { getDb } from "./db.js";
import { ALL_PERMISSIONS, publicAdminUser } from "../src/data/permissions.js";

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

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash: hash };
}

export function verifyStoredPassword(plain, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  let derived;
  try {
    derived = crypto.scryptSync(String(plain), user.passwordSalt, 64).toString("hex");
  } catch {
    return false;
  }
  const a = Buffer.from(derived);
  const b = Buffer.from(String(user.passwordHash));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cookieHeader(token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function createSessionCookie(session = { isOwner: true }) {
  const payload = session.isOwner ? { isOwner: true, exp: Date.now() + TTL_MS } : { uid: session.uid, exp: Date.now() + TTL_MS };
  return cookieHeader(sign(payload), Math.floor(TTL_MS / 1000));
}

export function clearSessionCookie() {
  return cookieHeader("", 0);
}

export function systemOwner() {
  return publicAdminUser(null, { isOwner: true });
}

export function getSessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  const payload = verify(token);
  if (!payload) return null;
  if (payload.isOwner || payload.role === "admin") return systemOwner();
  if (!payload.uid) return null;
  const user = (getDb().adminUsers || []).find((u) => u.id === payload.uid);
  if (!user || user.active === false) return null;
  return publicAdminUser(user);
}

export function isAdmin(req) {
  return Boolean(getSessionUser(req));
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function requirePermission(perm) {
  return (req, res, next) => {
    const user = getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (user.isOwner || user.permissions?.[perm] === true) {
      next();
      return;
    }
    res.status(403).json({ error: "forbidden" });
  };
}

export { ALL_PERMISSIONS };
