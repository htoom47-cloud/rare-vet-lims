/**
 * Render 50×25 mm thermal labels as ZPL graphics (^GFA).
 * Used for Arabic text — Zebra built-in fonts lack reliable Arabic glyphs,
 * while Windows/browser fonts render Arabic correctly (same as print preview).
 */
import JsBarcode from 'jsbarcode';
import { buildThermalLabelContent, barcodeEncodeDigits } from './labelPanel';

export const LABEL_DOTS_W = 400; // 50 mm @ 203 dpi
export const LABEL_DOTS_H = 200; // 25 mm @ 203 dpi

const LAYOUT = {
  barcodeY: 18, // +1 mm from top (8 dots @ 203 dpi)
  barcodeHeight: 42,
  digitsY: 76,
  sampleY: 110,
  testY: 146,
  animalY: 182,
};

const truncateCanvasText = (ctx, text, maxWidth) => {
  const value = String(text || '').trim();
  if (!value) return '';
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
};

const drawCenteredLine = (ctx, text, y, { font, maxWidth }) => {
  if (!text) return;
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const line = truncateCanvasText(ctx, text, maxWidth);
  ctx.fillText(line, LABEL_DOTS_W / 2, y);
};

/** Monochrome bitmap → ZPL ^GFA hex (black = 1). */
export const canvasToZplGfa = (canvas) => {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let byteX = 0; byteX < bytesPerRow; byteX += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteX * 8 + bit;
        if (x >= width) continue;
        const i = (y * width + x) * 4;
        const alpha = data[i + 3];
        if (alpha < 128) continue;
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (lum < 180) byte |= (0x80 >> bit);
      }
      bytes[y * bytesPerRow + byteX] = byte;
    }
  }

  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).toUpperCase().padStart(2, '0');
  }
  const total = bytes.length;
  return `^GFA,${total},${total},${bytesPerRow},${hex}`;
};

export const renderLabelCanvas = (sample, { isArabic = true } = {}) => {
  const content = buildThermalLabelContent(sample, { isArabic });
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_DOTS_W;
  canvas.height = LABEL_DOTS_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, LABEL_DOTS_W, LABEL_DOTS_H);
  ctx.fillStyle = '#000';

  const encode = content.barcodeEncode || barcodeEncodeDigits(content.barcode);
  if (encode) {
    const barcodeCanvas = document.createElement('canvas');
    try {
      JsBarcode(barcodeCanvas, encode, {
        format: 'CODE128',
        width: 2,
        height: LAYOUT.barcodeHeight,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
      const x = Math.max(0, Math.floor((LABEL_DOTS_W - barcodeCanvas.width) / 2));
      ctx.drawImage(barcodeCanvas, x, LAYOUT.barcodeY);
    } catch {
      /* barcode draw failed — text lines still print */
    }
  }

  const maxText = LABEL_DOTS_W - 16;
  const arabicFont = 'Tahoma, "Segoe UI", Arial, sans-serif';
  const latinFont = 'Consolas, "Courier New", monospace';

  drawCenteredLine(ctx, content.barcodeDigits, LAYOUT.digitsY, {
    font: `bold 34px ${latinFont}`,
    maxWidth: maxText,
  });
  drawCenteredLine(ctx, content.sampleLine, LAYOUT.sampleY, {
    font: `600 26px ${isArabic ? arabicFont : latinFont}`,
    maxWidth: maxText,
  });
  drawCenteredLine(ctx, content.testLine, LAYOUT.testY, {
    font: `700 26px ${isArabic ? arabicFont : latinFont}`,
    maxWidth: maxText,
  });
  drawCenteredLine(ctx, content.animalTypeLine, LAYOUT.animalY, {
    font: `600 26px ${arabicFont}`,
    maxWidth: maxText,
  });

  return { canvas, content };
};

/** Full-label graphic ZPL — Arabic-safe (fonts from the PC, not printer ROM). */
export const buildGraphicLabelZpl = (sample, { isArabic = true } = {}) => {
  const { canvas } = renderLabelCanvas(sample, { isArabic });
  const gfa = canvasToZplGfa(canvas);
  return [
    '^XA',
    '^FX LIMS label graphic 50x25 Arabic-safe',
    '^CI0',
    '^MTD',
    '^MD30',
    '^MNW',
    '^PR3',
    `^PW${LABEL_DOTS_W}`,
    `^LL${LABEL_DOTS_H}`,
    '^LH0,0',
    '^LT0',
    '^LS0',
    '^FWN',
    '^PON',
    `^FO0,0${gfa}`,
    '^XZ',
  ].join('\n');
};
