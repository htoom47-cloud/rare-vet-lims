const MAX_EDGE = 1600;
const MAX_BYTES = 12 * 1024 * 1024;
const SMALL_BYTES = 1.5 * 1024 * 1024;

function isKnownImageType(type, name) {
  const t = String(type || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  return /image\/(jpeg|jpg|png|webp|gif)/.test(t) || /\.(jpe?g|png|webp|gif)$/.test(n);
}

function isHeic(file) {
  const t = String(file?.type || "").toLowerCase();
  const n = String(file?.name || "").toLowerCase();
  return t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
}

async function bitmapToJpeg(bitmap) {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("encode_failed");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("encode_failed");
  return blob;
}

export async function prepareProductImage(file) {
  if (!file || file.size < 32) throw new Error("invalid_image");
  if (file.size > MAX_BYTES) throw new Error("too_large");
  if (isKnownImageType(file.type, file.name) && file.size <= SMALL_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return await bitmapToJpeg(bitmap);
    } finally {
      bitmap.close?.();
    }
  } catch {
    if (isHeic(file)) throw new Error("heic_unsupported");
    if (isKnownImageType(file.type, file.name)) return file;
    throw new Error("invalid_image");
  }
}

export function imageUploadErrorAr(code) {
  if (code === "heic_unsupported") return "صيغة الصورة غير مدعومة. من الجوال احفظ الصورة JPG أو PNG ثم ارفعها.";
  if (code === "too_large" || code === "entity_too_large") return "الصورة أكبر من الحد المسموح. اختر صورة أصغر.";
  if (code === "invalid_image") return "تعذر قراءة الصورة. استخدم JPG أو PNG أو WEBP.";
  return "تعذر رفع الصورة. استخدم JPG أو PNG أو WEBP بحجم مناسب ثم احفظ المنتج.";
}
