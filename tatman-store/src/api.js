async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "request_failed");
    err.status = res.status;
    err.detail = data.detail || "";
    throw err;
  }
  return data;
}

export const api = {
  catalog: (country) => request(`/api/catalog?country=${country}`),
  createOrder: (payload) => request("/api/orders", { method: "POST", body: payload }),
  login: (username, password) =>
    request("/api/admin/login", {
      method: "POST",
      body: typeof username === "string" && password !== undefined ? { username, password } : { password: username },
    }),
  logout: () => request("/api/admin/logout", { method: "POST", body: {} }),
  session: () => request("/api/admin/session"),
  overview: () => request("/api/admin/overview"),
  products: () => request("/api/admin/products"),
  saveProduct: (id, body) =>
    id
      ? request(`/api/admin/products/${id}`, { method: "PUT", body })
      : request("/api/admin/products", { method: "POST", body }),
  deleteProduct: (id) => request(`/api/admin/products/${id}`, { method: "DELETE" }),
  uploadImage: async (file) => {
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "upload_failed");
      err.status = res.status;
      throw err;
    }
    return data;
  },
  orders: () => request("/api/admin/orders"),
  updateOrder: (id, body) => request(`/api/admin/orders/${id}`, { method: "PUT", body }),
  customers: () => request("/api/admin/customers"),
  settings: () => request("/api/admin/settings"),
  saveSettings: (body) => request("/api/admin/settings", { method: "PUT", body }),
  testShipping: (country, courierId) =>
    request("/api/admin/shipping/test", { method: "POST", body: { country, courierId } }),
  createShipment: (id) => request(`/api/admin/orders/${id}/shipment`, { method: "POST", body: {} }),
  previewCoupon: (body) => request("/api/coupons/preview", { method: "POST", body }),
  coupons: () => request("/api/admin/coupons"),
  saveCoupon: (id, body) =>
    id
      ? request(`/api/admin/coupons/${id}`, { method: "PUT", body })
      : request("/api/admin/coupons", { method: "POST", body }),
  deleteCoupon: (id) => request(`/api/admin/coupons/${id}`, { method: "DELETE" }),
  revenue: (period = "all") => request(`/api/admin/revenue?period=${period}`),
  users: () => request("/api/admin/users"),
  saveUser: (id, body) =>
    id ? request(`/api/admin/users/${id}`, { method: "PUT", body }) : request("/api/admin/users", { method: "POST", body }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" }),
};
