/**
 * Copies USB-ready reception display folder to desktop (or custom path).
 * Usage: node tools/reception-display-usb/package.js [outputDir]
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outDir = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'reception-display-usb');

const files = ['index.html', 'اقرأني.txt'];
const logoSrc = path.join(root, '../../backend/assets/logo.png');

fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  fs.copyFileSync(path.join(root, f), path.join(outDir, f));
}

if (fs.existsSync(logoSrc)) {
  fs.copyFileSync(logoSrc, path.join(outDir, 'logo.png'));
} else {
  console.warn('logo.png not found at', logoSrc);
}

console.log('USB package ready:', outDir);
console.log('Copy this folder to your flash drive, then open index.html on the TV.');
