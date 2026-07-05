const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
registerFont(FONT, { family: 'Noto Sans Arabic' });
const text = 'مركز رعاية النوادر البيطري';
[14, 16, 18, 20, 22].forEach((size) => {
  const c = createCanvas(400, 50);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 400, 50);
  ctx.direction = 'rtl';
  ctx.font = `${size}px "Noto Sans Arabic"`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'right';
  ctx.fillText(text, 390, 35);
  fs.writeFileSync(path.join(__dirname, `../../uploads/reports/min-size-${size}.png`), c.toBuffer('image/png'));
  console.log('done', size);
});
