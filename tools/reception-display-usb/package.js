/**
 * Copies USB-ready reception display folder to desktop (or custom path).
 * Usage: node tools/reception-display-usb/package.js [outputDir]
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outDir = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'reception-display-usb');

const files = ['index.html', 'اقرأني.txt', 'pricing-banner.png', 'logo-gold.png'];
const logoSrc = path.join(root, '../../backend/assets/logo.png');
const goldLogoScript = path.join(root, 'generate-gold-logo.js');

if (fs.existsSync(goldLogoScript)) {
  require('child_process').execSync(`node "${goldLogoScript}"`, { stdio: 'inherit', cwd: root });
}

fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, f));
  }
}

if (fs.existsSync(logoSrc)) {
  fs.copyFileSync(logoSrc, path.join(outDir, 'logo.png'));
} else {
  console.warn('logo.png not found at', logoSrc);
}

console.log('USB package ready:', outDir);
console.log('Copy this folder to your flash drive, then open index.html on the TV.');
