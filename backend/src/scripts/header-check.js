const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/header-check-v7.pdf');

const rev = (s) => s.split('').reverse().join('');
const shape = (t) => rev(arabicReshaper.convertArabic(t));

const doc = new PDFDocument({ size: 'A4', margin: 40 });
doc.pipe(fs.createWriteStream(OUT));
doc.registerFont('Ar', fs.readFileSync(FONT));
doc.registerFont('Hb', 'Helvetica-Bold');

const phrases = [
  'مركز رعاية النوادر البيطري',
  'تعداد الدم الكامل',
  'كريات الدم البيضاء',
  'تقرير نتائج المختبر',
];

let y = 40;
phrases.forEach((p, i) => {
  doc.font('Hb').fontSize(8).fillColor('#999').text(`Line ${i + 1}`, 40, y);
  y += 12;
  const v = shape(p);
  doc.font('Ar').fontSize(14).fillColor('#000');
  const tw = doc.widthOfString(v);
  doc.text(v, 500 - tw, y, { lineBreak: false });
  y += 28;
});

doc.end();
console.log('OK', OUT);
