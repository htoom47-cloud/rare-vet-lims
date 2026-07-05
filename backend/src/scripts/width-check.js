const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const rev = (s) => s.split('').reverse().join('');
const shape = (t) => rev(arabicReshaper.convertArabic(t));

const doc = new PDFDocument({ size: 'A4' });
doc.registerFont('Ar', fs.readFileSync(FONT));

const phrases = [
  'مركز رعاية النوادر البيطري',
  'تعداد الدم الكامل',
  'كريات الدم البيضاء',
  'تقرير نتائج المختبر',
];

phrases.forEach((p) => {
  doc.font('Ar').fontSize(14);
  const v = shape(p);
  const tw = doc.widthOfString(v);
  console.log(JSON.stringify(p), 'visualLen', v.length, 'width', tw, 'empty', !v || !tw);
});
