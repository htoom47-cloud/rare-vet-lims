const arabicReshaper = require('arabic-reshaper');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/ar-methods-v6.pdf');

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

let y = 50;
doc.font('Helvetica').fontSize(14).text('Arabic rendering methods', 40, y);
y += 30;

samples.forEach((sample, i) => {
  const rowY = y + i * 90;
  doc.font('Helvetica').fontSize(9).fillColor('#333')
    .text(`Sample ${i + 1}: logical UTF-8 in source`, 40, rowY);

  // A: logical + rtla
  doc.font('Ar').fontSize(16).fillColor('#000')
    .text(sample, 40, rowY + 14, { width: 500, align: 'right', features: ['rtla'] });
  doc.font('Helvetica').fontSize(7).fillColor('#666').text('A: logical + rtla', 40, rowY + 34);

  // B: shaped+reversed, no rtla
  doc.font('Ar').fontSize(16).fillColor('#004')
    .text(shapeVisual(sample), 40, rowY + 44, { width: 500, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor('#666').text('B: convertArabic + reverse', 40, rowY + 64);
});

doc.end();
stream.on('finish', () => console.log('OK', OUT));
