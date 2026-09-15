export const PERMISSIONS = [
  { id: "products", ar: "المنتجات" },
  { id: "orders", ar: "الطلبات" },
  { id: "customers", ar: "العملاء" },
  { id: "coupons", ar: "أكواد الخصم" },
  { id: "revenue", ar: "الإيرادات" },
  { id: "settings", ar: "الإعدادات" },
  { id: "users", ar: "المستخدمون والصلاحيات" },
];

export const ALL_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((p) => [p.id, true]));

export function emptyPermissions() {
  return Object.fromEntries(PERMISSIONS.map((p) => [p.id, false]));
}

export function normalizePermissions(input, isOwner = false) {
  if (isOwner) return { ...ALL_PERMISSIONS };
  const src = input && typeof input === "object" ? input : {};
  const out = emptyPermissions();
  for (const p of PERMISSIONS) out[p.id] = src[p.id] === true;
  return out;
}

export function can(user, perm) {
  if (!user) return false;
  if (user.isOwner) return true;
  return user.permissions?.[perm] === true;
}

export function normalizeUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
}

export function publicAdminUser(user, { isOwner = false } = {}) {
  if (!user && !isOwner) return null;
  if (isOwner) {
    return {
      id: "system",
      username: "admin",
      name: "مالك النظام",
      isOwner: true,
      active: true,
      permissions: { ...ALL_PERMISSIONS },
    };
  }
  return {
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    isOwner: false,
    active: user.active !== false,
    permissions: normalizePermissions(user.permissions, false),
  };
}
