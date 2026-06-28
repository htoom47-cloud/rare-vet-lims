/**
 * Arabic text helpers for PDF reports.
 * Canvas RTL raster when available; otherwise arLine shaping (same as legacy pdf.js).
 */
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');
const raster = require('./pdf-arabic-raster');

const FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Bold.ttf');
const HAS_FONT = fs.existsSync(FONT_PATH);
const HAS_BOLD_FONT = fs.existsSync(FONT_BOLD_PATH);

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/;
const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F]+/g;

const hasArabic = (t) => ARABIC_RE.test(String(t || ''));

/** Split customer name for bilingual PDF rows — never pass Arabic through Latin font. */
const resolveBilingualCustomer = (name, nameAr) => {
  const raw = String(name || '').trim();
  const arField = String(nameAr || '').trim();
  const customerAr = arField || (hasArabic(raw) ? raw : null);
  const customerEn = raw && !hasArabic(raw) ? raw : null;
  return { customerEn, customerAr };
};

const registerPdfFonts = (doc) => {
  if (HAS_FONT) {
    doc.registerFont('Ar', FONT_PATH);
    doc.registerFont('ArB', HAS_BOLD_FONT ? FONT_BOLD_PATH : FONT_PATH);
  }
  doc.registerFont('En', 'Helvetica');
  doc.registerFont('EnB', 'Helvetica-Bold');
};

const setEn = (doc, bold = false) => doc.font(bold ? 'EnB' : 'En');
const setAr = (doc, bold = false) => doc.font(HAS_FONT ? (bold ? 'ArB' : 'Ar') : (bold ? 'EnB' : 'En'));

const textY = (y, size) => y - size + 1;
const boxH = (size) => Math.ceil(size * 1.45);

/** Legacy pdf.js Arabic line shaping — proven on this project. */
const reshapeWord = (word) => {
  if (!/[\u0600-\u06FF]/.test(word)) return word;
  try {
    return arabicReshaper.convertArabic(word).split('').reverse().join('');
  } catch {
    return word;
  }
};

const arLine = (line) => {
  const s = String(line ?? '').trim();
  if (!s) return '';
  if (/[0-9A-Za-z]/.test(s)) return s.replace(ARABIC_RUN, (m) => reshapeWord(m));
  return s.split(/\s+/).map(reshapeWord).reverse().join(' ');
};

const shapeVisual = arLine;

const measureEn = (doc, text, size, bold = false) => {
  setEn(doc, bold);
  doc.fontSize(size);
  return doc.widthOfString(String(text ?? ''));
};

const measureAr = (doc, text, size, bold = false) => {
  const shaped = arLine(text);
  if (!shaped) return { shaped: '', width: 0 };
  setAr(doc, bold);
  doc.fontSize(size);
  return { shaped, width: doc.widthOfString(shaped) };
};

const drawEn = (doc, text, x, y, opts = {}) => {
  const { size = 8, color = '#4A3728', bold = false, width, align = 'left', fromTop = false } = opts;
  setEn(doc, bold);
  doc.fontSize(size).fillColor(color);
  const str = String(text ?? '');
  const yPos = fromTop ? y : textY(y, size);
  if (width) doc.text(str, x, yPos, { width, align, lineBreak: false });
  else doc.text(str, x, yPos, { lineBreak: false });
  return doc.widthOfString(str);
};

const firstArabicIndex = (str) => {
  for (let i = 0; i < str.length; i += 1) {
    if (hasArabic(str[i])) return i;
  }
  return -1;
};

const drawArShaped = (doc, text, x, y, w, opts = {}) => {
  const { size = 8, color = '#4A3728', bold = false, align = 'right', fromTop = false } = opts;
  const shaped = arLine(text);
  if (!shaped) return 0;
  setAr(doc, bold);
  doc.fontSize(size).fillColor(color);
  const yPos = fromTop ? y : textY(y, size);
  doc.text(shaped, x, yPos, { width: w, align, lineBreak: false, ellipsis: true });
  return w;
};

const drawArBox = (doc, text, x, y, w, opts = {}) => {
  const { size = 8, color = '#4A3728', bold = false, align = 'right', fromTop = false } = opts;
  const str = String(text ?? '').trim();
  if (!str) return 0;

  const h = boxH(size);
  const imgY = fromTop ? y : y - h + 2;

  if (raster.available && hasArabic(str)) {
    const buf = raster.rasterAr(str, w, h, { size, color, bold, align });
    if (buf) {
      doc.image(buf, x, imgY, { width: w, height: h });
      return w;
    }
  }

  return drawArShaped(doc, str, x, y, w, { size, color, bold, align, fromTop });
};

const drawAr = (doc, text, x, y, w, opts = {}) => {
  const str = String(text ?? '').trim();
  if (!str) return;

  if (!hasArabic(str)) {
    drawEn(doc, str, x, y, { ...opts, width: w, align: opts.align || 'left' });
    return;
  }

  const arIdx = firstArabicIndex(str);
  if (arIdx > 0) {
    const latin = str.slice(0, arIdx).trimEnd();
    const arabic = str.slice(arIdx).trim();
    const yPos = opts.fromTop ? y : textY(y, opts.size || 8);
    if (latin) {
      setEn(doc, opts.bold);
      doc.fontSize(opts.size || 8).fillColor(opts.color || '#4A3728');
      doc.text(latin, x, yPos, { lineBreak: false });
    }
    if (arabic) drawArBox(doc, arabic, x, y, w, { ...opts, align: opts.align || 'right' });
    return;
  }

  drawArBox(doc, str, x, y, w, opts);
};

const drawArCell = (doc, text, x, y, w, opts = {}) => {
  drawArBox(doc, text, x, y, w, { align: 'right', ...opts });
};

const drawArAtRight = (doc, text, rightX, y, opts = {}) => {
  const startX = opts.minLeft ?? 0;
  const w = Math.max(1, rightX - startX);
  return drawArBox(doc, text, startX, y, w, { align: 'right', ...opts });
};

const drawArRasterInBox = drawArAtRight;

module.exports = {
  HAS_FONT, hasArabic, resolveBilingualCustomer, registerPdfFonts, drawEn, drawAr, drawArBox, drawArCell,
  measureEn, measureAr, drawArAtRight, drawArRasterInBox, shapeVisual, arLine,
};
