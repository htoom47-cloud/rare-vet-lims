const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/canvas-ar-test.png');

const families = ['NotoArabic', 'Noto Sans Arabic', 'NotoSansArabic'];
const text = 'مركز رعاية النوادر البيطري';

families.forEach((family, i) => {
  try {
    registerFont(FONT, { family });
  } catch (e) {
    console.log('register fail', family, e.message);
  }
  const c = createCanvas(500, 60);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 500, 60);
  ctx.fillStyle = '#000';
  ctx.font = `22px "${family}"`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  try {
    ctx.fillText(text, 490, 30);
    fs.writeFileSync(OUT.replace('.png', `-${i}.png`), c.toBuffer('image/png'));
    console.log('OK', family, OUT.replace('.png', `-${i}.png`));
  } catch (e) {
    console.log('draw fail', family, e.message);
  }
});
