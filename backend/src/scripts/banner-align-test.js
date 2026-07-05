const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');
const { createCanvas, registerFont } = require('canvas');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/banner-align-test.pdf');
const GOLD = '#B8904D';
const colW = 271;
const H = 12;
const SIZE = 8;

registerFont(FONT, { family: 'NotoAr' });
const rev = (s) => s.split('').reverse().join('');
const shapedRev = (t) => rev(arabicReshaper.convertArabic(t));

const rasterAr = (text, boxW, boxH, fontSize, color) => {
  const scale = 3;
  const canvas = createCanvas(boxW * scale, boxH * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';
  ctx.font = `bold ${fontSize}px NotoAr`;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, boxW - 8, boxH / 2);
  return canvas.toBuffer('image/png');
};

const doc = new PDFDocument({ size: 'A4', margin: 24 });
doc.pipe(fs.createWriteStream(OUT));
doc.registerFont('Ar', fs.readFileSync(FONT));
doc.registerFont('Hb', 'Helvetica-Bold');

let y = 40;
const row = (label, draw) => {
  doc.font('Helvetica').fontSize(7).fillColor('#666').text(label, 24, y);
  y += 10;
  draw(24, y, colW);
  y += H + 14;
};

row('1 shaped NO reverse (broken)', (x, yy, w) => {
  doc.rect(x, yy, w, H).fill(GOLD);
  const s = arabicReshaper.convertArabic('صورة الدم');
  doc.font('Hb').fontSize(SIZE).fillColor('#fff').text('Hematology Report', x + 4, yy + 2);
  doc.font('Ar').fontSize(SIZE).fillColor('#fff');
  const tw = doc.widthOfString(s);
  doc.text(s, x + w - 8 - tw, yy + 2);
});

row('2 shaped+reverse (fix)', (x, yy, w) => {
  doc.rect(x, yy, w, H).fill(GOLD);
  const s = shapedRev('صورة الدم');
  doc.font('Hb').fontSize(SIZE).fillColor('#fff').text('Hematology Report', x + 4, yy + 2);
  doc.font('Ar').fontSize(SIZE).fillColor('#fff');
  const tw = doc.widthOfString(s);
  doc.text(s, x + w - 8 - tw, yy + 2);
});

row('3 rtla logical', (x, yy, w) => {
  doc.rect(x, yy, w, H).fill(GOLD);
  const mid = x + Math.floor(w / 2);
  doc.font('Hb').fontSize(SIZE).fillColor('#fff').text('Hematology Report', x + 4, yy + 2, { width: mid - x - 6 });
  doc.font('Ar').fontSize(SIZE).fillColor('#fff').text('صورة الدم', mid, yy + 2, {
    width: x + w - mid - 8, align: 'right', features: ['rtla'], lineBreak: false,
  });
});

row('4 canvas RTL raster', (x, yy, w) => {
  doc.rect(x, yy, w, H).fill(GOLD);
  const mid = x + Math.floor(w / 2);
  doc.font('Hb').fontSize(SIZE).fillColor('#fff').text('Hematology Report', x + 4, yy + 2);
  const arW = x + w - mid;
  const buf = rasterAr('صورة الدم', arW, H, SIZE, '#ffffff');
  doc.image(buf, mid, yy, { width: arW, height: H });
});

doc.end();
console.log('OK', OUT);
