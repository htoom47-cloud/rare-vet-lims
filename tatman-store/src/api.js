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
    throw err;
  }
  return data;
}

export const api = {
  catalog: (country) => request(`/api/catalog?country=${country}`),
  createOrder: (payload) => request("/api/orders", { method: "POST", body: payload }),
  login: (password) => request("/api/admin/login", { method: "POST", body: { password } }),
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
  settings: () => request("/api/admin/settings"),
  saveSettings: (body) => request("/api/admin/settings", { method: "PUT", body }),
};
