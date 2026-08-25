/** null = stock is not tracked (unlimited). 0 = out of stock. */
export function stockOf(product, country) {
  if (!product) return null;
  const raw = country === "sa" ? product.stockSa : product.stockQa;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function productImages(product) {
  if (!product) return [];
  const list = [];
  const src = Array.isArray(product.images) ? product.images : [];
  if (product.image) list.push(product.image);
  for (const url of src) {
    if (url && !list.includes(url)) list.push(url);
  }
  return list;
}

export function productImage(product) {
  return productImages(product)[0] || "";
}
