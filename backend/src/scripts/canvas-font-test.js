const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const F = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
registerFont(F, { family: 'Noto Sans Arabic' });

const c = createCanvas(400, 60);
const ctx = c.getContext('2d');
ctx.direction = 'rtl';
ctx.font = '14px "Noto Sans Arabic"';
ctx.fillStyle = '#000';
ctx.textAlign = 'right';
ctx.fillText('مركز رعاية النوادر البيطري', 390, 30);
ctx.fillText('صورة الدم', 390, 50);

const out = path.join(__dirname, '../../uploads/reports/_canvas-test.png');
fs.writeFileSync(out, c.toBuffer('image/png'));
console.log('OK', out, 'width', ctx.measureText('صورة الدم').width);
