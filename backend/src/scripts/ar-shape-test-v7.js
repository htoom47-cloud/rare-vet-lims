const arabicReshaper = require('arabic-reshaper');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/ar-methods-v7.pdf');

const samples = [
  'تعداد الدم الكامل',
  'تقرير نتائج المختبر',
  'بيانات التقرير والحالة',
  'نسبة اللمفاويات',
];

const reverse = (s) => s.split('').reverse().join('');
const shapeVisual = (text) => reverse(arabicReshaper.convertArabic(text));

const doc = new PDFDocument({ size: 'A4', margin: 40 });
const stream = fs.createWriteStream(OUT);
doc.pipe(stream);
doc.registerFont('Ar', fs.readFileSync(FONT));

const boxX = 40;
const boxW = 500;
let y = 50;

doc.font('Helvetica').fontSize(14).text('Arabic methods v7', boxX, y);
y += 28;

samples.forEach((sample, i) => {
  const rowY = y + i * 100;
  doc.font('Helvetica').fontSize(8).fillColor('#333').text(`Sample ${i + 1}`, boxX, rowY);

  // C: visual string, align left (string already visual LTR)
  const visual = shapeVisual(sample);
  doc.font('Ar').fontSize(18).fillColor('#000');
  doc.text(visual, boxX, rowY + 12, { width: boxW, align: 'left', lineBreak: false });
  doc.font('Helvetica').fontSize(7).fillColor('#666').text('C: shaped+reversed, align left', boxX, rowY + 36);

  // D: visual string, manual right position
  doc.font('Ar').fontSize(18).fillColor('#004');
  const tw = doc.widthOfString(visual);
  doc.text(visual, boxX + boxW - tw, rowY + 52, { lineBreak: false });
  doc.font('Helvetica').fontSize(7).fillColor('#666').text('D: shaped+reversed, manual right', boxX, rowY + 76);
});

doc.end();
stream.on('finish', () => console.log('OK', OUT));
