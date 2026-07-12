/** Target under server multer limit (10 MB) with headroom. */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_EDGE = 2560;

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

/**
 * Shrink large microscope/camera images before upload.
 * Returns the original file if already small or if compression is unsupported.
 */
export async function compressImageForUpload(file, {
  maxBytes = DEFAULT_MAX_BYTES,
  maxEdge = DEFAULT_MAX_EDGE,
} = {}) {
  if (!file || typeof File === 'undefined') return file;
  if (file.size <= maxBytes) return file;

  const mime = String(file.type || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return file;
  if (/heic|heif|tiff/.test(mime) || /\.(heic|heif|tiff?)$/i.test(file.name || '')) {
    return file;
  }

  try {
    const img = await loadImageFromFile(file);
    let { width, height } = img;
    if (!width || !height) return file;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.85;
    let out = await canvasToJpegFile(canvas, file.name, quality);
    while (out && out.size > maxBytes && quality > 0.45) {
      quality -= 0.1;
      out = await canvasToJpegFile(canvas, file.name, quality);
    }

    if (out && out.size < file.size) return out;
    return file;
  } catch {
    return file;
  }
}
