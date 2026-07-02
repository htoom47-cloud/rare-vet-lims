/** Canvas-based Arabic raster (best quality). Optional — falls back if canvas blocked. */
const fs = require('fs');
const path = require('path');

const FONT_PATH = [
  path.join(__dirname, '../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  path.join(__dirname, '../../assets/fonts/Cairo-Regular.ttf'),
  path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf'),
].find((p) => fs.existsSync(p));
const FONT_BOLD_PATH = [
  path.join(__dirname, '../../assets/fonts/IBMPlexSansArabic-Bold.ttf'),
  path.join(__dirname, '../../assets/fonts/Cairo-Bold.ttf'),
  path.join(__dirname, '../../assets/fonts/NotoSansArabic-Bold.ttf'),
].find((p) => fs.existsSync(p));
const HAS_FONT = !!FONT_PATH;
const HAS_BOLD = !!FONT_BOLD_PATH;

let available = false;
let createCanvas;
let registerFont;
let registered = false;

try {
  ({ createCanvas, registerFont } = require('canvas'));
  available = true;
} catch {
  available = false;
}

const ensureFont = () => {
  if (!available || registered || !HAS_FONT) return;
  registerFont(FONT_PATH, { family: 'NotoArPdf' });
  if (HAS_BOLD) registerFont(FONT_BOLD_PATH, { family: 'NotoArPdfBold' });
  registered = true;
};

const rasterAr = (text, boxW, boxH, opts = {}) => {
  if (!available || !HAS_FONT) return null;
  ensureFont();
  const {
    size = 8, color = '#000', bold = false, align = 'right', scale = 3,
  } = opts;
  const w = Math.max(4, Math.ceil(boxW));
  const h = Math.max(4, Math.ceil(boxH));
  const canvas = createCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';
  ctx.font = `${size}px ${bold && HAS_BOLD ? 'NotoArPdfBold' : 'NotoArPdf'}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  let x = w / 2;
  if (align === 'right') { ctx.textAlign = 'right'; x = w - 2; }
  else if (align === 'left') { ctx.textAlign = 'left'; x = 2; }
  else { ctx.textAlign = 'center'; x = w / 2; }
  ctx.fillText(String(text ?? ''), x, h / 2);
  return canvas.toBuffer('image/png');
};

module.exports = { available, rasterAr };
