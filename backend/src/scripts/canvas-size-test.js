const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
registerFont(FONT, { family: 'NotoSansArabic' });

[7, 8, 9.5, 11, 22].forEach((size) => {
  const c = createCanvas(300, 40);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 300, 40);
  ctx.fillStyle = '#000';
  ctx.font = `${size}px "NotoSansArabic"`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText('مركز رعاية النوادر البيطري', 290, 28);
  const out = path.join(__dirname, `../../uploads/reports/canvas-size-${size}.png`);
  fs.writeFileSync(out, c.toBuffer('image/png'));
  console.log('wrote', out);
});
