/**
 * Mini trend chart PNG for PDF embedding (design 2).
 */
const { createCanvas } = require('canvas');

const TREND_CODES = new Set(['WBC', 'RBC', 'HGB', 'HCT', 'PLT', 'NEU', 'GLU', 'BUN', 'CREA']);

const buildSparklineBuffer = (points, opts = {}) => {
  const { width = 52, height = 14, color = '#4A3728', fill = '#C5A059' } = opts;
  const values = (points || [])
    .map((p) => (p.numericValue != null ? Number(p.numericValue) : Number(p.value)))
    .filter((n) => !Number.isNaN(n));

  if (values.length < 2) return null;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const coords = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * innerW,
    y: pad + innerH - ((v - min) / range) * innerH,
  }));

  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  coords.slice(1).forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const last = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  return canvas.toBuffer('image/png');
};

const calcChangePct = (current, previous) => {
  const cur = Number(current);
  const prev = Number(previous);
  if (Number.isNaN(cur) || Number.isNaN(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
};

const shouldShowTrend = (code) => TREND_CODES.has(String(code || '').toUpperCase());

module.exports = {
  TREND_CODES,
  buildSparklineBuffer,
  calcChangePct,
  shouldShowTrend,
};
