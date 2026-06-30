/**
 * Gold line-art logo with transparent background for reception display (dark theme).
 * Usage: node tools/reception-display-usb/generate-gold-logo.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '../../backend/node_modules/sharp'));

const LOGO_SRC = path.join(__dirname, '../../backend/assets/logo.png');
const GOLD = '#D4AF37';
const OUT_PATHS = [
  path.join(__dirname, 'logo-gold.png'),
  path.join(__dirname, '../../frontend/public/reception-display-usb/logo-gold.png'),
];

const hexToRgb = (hex) => {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

async function main() {
  const [tr, tg, tb] = hexToRgb(GOLD);
  const { data, info } = await sharp(LOGO_SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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

  for (const out of OUT_PATHS) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log('Wrote', out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
