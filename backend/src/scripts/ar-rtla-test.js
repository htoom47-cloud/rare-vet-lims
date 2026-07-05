const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/ar-rtla-test.pdf');
const samples = ['مركز رعاية النوادر البيطري', 'الحمراء', 'المناعة', 'كرياتنين'];

const rev = (s) => s.split('').reverse().join('');
const shapedRev = (t) => rev(arabicReshaper.convertArabic(t));
const shapedOnly = (t) => arabicReshaper.convertArabic(t);

const doc = new PDFDocument({ size: 'A4', margin: 40 });
doc.pipe(fs.createWriteStream(OUT));
const fontData = fs.readFileSync(FONT);
doc.registerFont('Ar', fontData);

let y = 40;
const methods = [
  { name: 'rtla logical', draw(t, yy) {
    doc.font('Ar').fontSize(12).fillColor('#000');
    doc.text(t, 40, yy, { width: 500, align: 'right', features: ['rtla'], lineBreak: false });
  }},
  { name: 'shaped only', draw(t, yy) {
    const s = shapedOnly(t);
    doc.font('Ar').fontSize(12).fillColor('#004');
    const tw = doc.widthOfString(s);
    doc.text(s, 540 - tw, yy, { lineBreak: false });
  }},
  { name: 'shaped+reverse', draw(t, yy) {
    const s = shapedRev(t);
    doc.font('Ar').fontSize(12).fillColor('#060');
    const tw = doc.widthOfString(s);
    doc.text(s, 540 - tw, yy, { lineBreak: false });
  }},
];

samples.forEach((sample) => {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(sample, 40, y);
  y += 12;
  methods.forEach((m) => {
    doc.font('Helvetica').fontSize(8).fillColor('#888').text(m.name, 40, y);
    m.draw(sample, y);
    y += 16;
  });
  y += 8;
});

doc.end();
console.log('OK', OUT);
