/**
 * QR codes for fixed reception display dock (WhatsApp + client portal).
 * Usage: node tools/reception-display-usb/generate-reception-qrs.js
 */
const fs = require('fs');
const path = require('path');
const QRCode = require(path.join(__dirname, '../../backend/node_modules/qrcode'));

const WHATSAPP_URL = 'https://wa.me/966115007257';
const PORTAL_URL = 'https://portal.rarevetcare.com';

const OUT_DIR = __dirname;
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public/reception-display-usb');

const files = [
  { name: 'whatsapp-qr.png', url: WHATSAPP_URL },
  { name: 'portal-qr.png', url: PORTAL_URL },
];

async function writeQr(filePath, url) {
  await QRCode.toFile(filePath, url, {
    width: 148,
    margin: 1,
    color: { dark: '#2B1B17', light: '#FFFFFF' },
  });
}

async function main() {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const { name, url } of files) {
    const out = path.join(OUT_DIR, name);
    await writeQr(out, url);
    await writeQr(path.join(PUBLIC_DIR, name), url);
    console.log('Wrote', out, '→', url);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
