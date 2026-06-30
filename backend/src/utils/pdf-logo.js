const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);
const DEFAULT_LOGO_SIZE = 58;

const cache = new Map();

const hexToRgb = (hex) => {
  const h = String(hex || '#5B3A29').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 91,
    parseInt(h.slice(2, 4), 16) || 58,
    parseInt(h.slice(4, 6), 16) || 41,
  ];
};

/** Line-art logo tinted to brand brown (not black) for PDF headers. */
const getBrandLogoBuffer = async (brandColor = '#5B3A29') => {
  if (!HAS_LOGO) return null;
  const key = String(brandColor).toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const [tr, tg, tb] = hexToRgb(brandColor);
  const { data, info } = await sharp(LOGO_PATH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = ch === 4 ? data[i + 3] : 255;
    const lum = (r + g + b) / 3;
    if (a > 16 && lum < 220) {
      data[i] = tr;
      data[i + 1] = tg;
      data[i + 2] = tb;
      if (ch === 4) data[i + 3] = 255;
    } else if (ch === 4) {
      data[i + 3] = 0;
    }
  }

  const buf = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: ch },
  }).png().toBuffer();

  cache.set(key, buf);
  return buf;
};

const drawBillingHeaderLogo = (doc, logoBuf, pageW, margin, y, logoSize = DEFAULT_LOGO_SIZE) => {
  if (!logoBuf) return null;
  const logoX = (pageW - logoSize) / 2;
  try {
    doc.image(logoBuf, logoX, y, { width: logoSize, height: logoSize });
  } catch {
    return null;
  }
  return {
    logoX,
    leftW: logoX - margin - 8,
    rightX: logoX + logoSize + 8,
    rightW: pageW - margin - (logoX + logoSize + 8),
    headerH: logoSize + 6,
  };
};

module.exports = {
  LOGO_PATH,
  HAS_LOGO,
  DEFAULT_LOGO_SIZE,
  getBrandLogoBuffer,
  drawBillingHeaderLogo,
};
