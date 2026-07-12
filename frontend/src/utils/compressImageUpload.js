/** Aim under server limit with headroom for multipart overhead. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const TARGET_MAX_BYTES = 7.5 * 1024 * 1024;
const EDGE_STEPS = [2048, 1600, 1280, 1024, 800];

const loadImageFromFile = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not decode image'));
  };
  img.src = url;
});

const canvasToJpegFile = (canvas, fileName, quality) => new Promise((resolve) => {
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const base = (fileName || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
      resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    },
    'image/jpeg',
    quality,
  );
});

const isHeicLike = (file) => {
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '');
  return /heic|heif/.test(mime) || /\.(heic|heif)$/i.test(name);
};

/**
 * Shrink large microscope/camera images before upload.
 * Tries multiple resolutions/qualities until under TARGET_MAX_BYTES.
 */
export async function compressImageForUpload(file, {
  maxBytes = TARGET_MAX_BYTES,
  hardMaxBytes = UPLOAD_MAX_BYTES,
} = {}) {
  if (!file || typeof File === 'undefined') return file;
  if (file.size <= maxBytes) return file;

  if (isHeicLike(file)) {
    const err = new Error('HEIC_UNSUPPORTED');
    err.code = 'HEIC_UNSUPPORTED';
    throw err;
  }

  const mime = String(file.type || '').toLowerCase();
  if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
    return file;
  }

  try {
    const img = await loadImageFromFile(file);
    const srcW = img.width;
    const srcH = img.height;
    if (!srcW || !srcH) return file;

    let best = null;
    for (const maxEdge of EDGE_STEPS) {
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
      const width = Math.max(1, Math.round(srcW * scale));
      const height = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, width, height);

      for (let quality = 0.82; quality >= 0.4; quality -= 0.08) {
        const out = await canvasToJpegFile(canvas, file.name, quality);
        if (!out) continue;
        if (!best || out.size < best.size) best = out;
        if (out.size <= maxBytes) return out;
      }
    }

    if (best && best.size <= hardMaxBytes && best.size < file.size) return best;
    if (best && best.size < file.size) return best;
    return file;
  } catch (err) {
    if (err?.code === 'HEIC_UNSUPPORTED') throw err;
    return file;
  }
}
