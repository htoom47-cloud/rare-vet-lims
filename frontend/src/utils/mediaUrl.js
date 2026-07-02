const API_ORIGIN = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '') || '';

const SENSITIVE_UPLOAD_PREFIXES = [
  '/uploads/reports/',
  '/uploads/invoices/',
  '/uploads/microscope/',
  '/uploads/ministry-docs/',
];

/** Resolve upload URL; append staff JWT for sensitive paths (reports, microscope, invoices). */
export function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  const full = `${API_ORIGIN}${path}`;
  const needsAuth = SENSITIVE_UPLOAD_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (!needsAuth) return full;
  const token = localStorage.getItem('accessToken');
  if (!token) return full;
  const sep = full.includes('?') ? '&' : '?';
  return `${full}${sep}access_token=${encodeURIComponent(token)}`;
}

export default mediaUrl;
