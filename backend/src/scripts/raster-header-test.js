const path = require('path');
const fs = require('fs');

// Load raster function via requiring pdf internals is hard; duplicate minimal test
const { createCanvas, registerFont } = require('canvas');
const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const FAMILY = 'Noto Sans Arabic';
registerFont(FONT, { family: FAMILY });

const line = 'مركز رعاية النوادر البيطري';
const innerW = 200;
const innerH = 24;
const fontSize = 11;
const scale = 3;
const canvas = createCanvas(innerW * scale, innerH * scale);
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.scale(scale, scale);
ctx.direction = 'rtl';
ctx.font = `${fontSize}px "${FAMILY}"`;
ctx.fillStyle = '#4A3728';
ctx.textAlign = 'right';
ctx.textBaseline = 'alphabetic';
ctx.fillText(line, innerW - 6, innerH - 5);
const out = path.join(__dirname, '../../uploads/reports/raster-header-test.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('OK', out);
