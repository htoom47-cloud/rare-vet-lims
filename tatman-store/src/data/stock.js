/** null = stock is not tracked (unlimited). 0 = out of stock. */
export function stockOf(product, country) {
  if (!product) return null;
  let raw;
  if (country === "sa") raw = product.stockSa;
  else if (country === "qa") raw = product.stockQa;
  else raw = product.stock?.[country];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function decrementStock(product, country, qty) {
  const n = Math.max(0, Number(qty) || 0);
  if (country === "sa") {
    if (product.stockSa === null || product.stockSa === undefined || product.stockSa === "") return product;
    return { ...product, stockSa: Math.max(0, Number(product.stockSa) - n) };
  }
  if (country === "qa") {
    if (product.stockQa === null || product.stockQa === undefined || product.stockQa === "") return product;
    return { ...product, stockQa: Math.max(0, Number(product.stockQa) - n) };
  }
  const current = stockOf(product, country);
  if (current === null) return product;
  return {
    ...product,
    stock: { ...(product.stock || {}), [country]: Math.max(0, current - n) },
  };
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
