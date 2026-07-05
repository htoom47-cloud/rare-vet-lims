/**
 * Compare Arabic rendering methods using the same Noto font as production pdf.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');

const FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/ar-final-compare.pdf');
const PHRASE = 'مركز رعاية النوادر البيطري';

const rev = (s) => s.split('').reverse().join('');
const shapedRev = (t) => rev(arabicReshaper.convertArabic(t));

const doc = new PDFDocument({ size: 'A4', margin: 36 });
doc.pipe(fs.createWriteStream(OUT));
doc.registerFont('Ar', FONT_PATH);
doc.registerFont('Hb', 'Helvetica-Bold');

const methods = [
  {
    label: '1 logical + rtla + align right',
    draw(y) {
      doc.font('Ar').fontSize(13).fillColor('#000');
      doc.text(PHRASE, 36, y, { width: 520, align: 'right', features: ['rtla'], lineBreak: false });
    },
  },
  {
    label: '2 convertArabic only + align right (no reverse)',
    draw(y) {
      const s = arabicReshaper.convertArabic(PHRASE);
      doc.font('Ar').fontSize(13).fillColor('#004');
      const tw = doc.widthOfString(s);
      doc.text(s, 556 - tw, y, { lineBreak: false });
    },
  },
  {
    label: '3 convertArabic + reverse + manual right (current)',
    draw(y) {
      const s = shapedRev(PHRASE);
      doc.font('Ar').fontSize(13).fillColor('#060');
      const tw = doc.widthOfString(s);
      doc.text(s, 556 - tw, y, { lineBreak: false });
    },
  },
  {
    label: '4 logical on Helvetica (broken baseline)',
    draw(y) {
      doc.font('Hb').fontSize(13).fillColor('#c00');
      doc.text(PHRASE, 36, y, { width: 520, align: 'right', lineBreak: false });
    },
  },
  {
    label: '5 logical reversed on Helvetica (user bug pattern)',
    draw(y) {
      const s = rev(PHRASE);
      doc.font('Hb').fontSize(13).fillColor('#909');
      const tw = doc.widthOfString(s);
      doc.text(s, 556 - tw, y, { lineBreak: false });
    },
  },
];

let y = 40;
doc.font('Hb').fontSize(14).text('Arabic method comparison', 36, y);
y += 24;

methods.forEach((m) => {
  doc.font('Hb').fontSize(8).fillColor('#555').text(m.label, 36, y);
  y += 11;
  m.draw(y);
  y += 22;
});

doc.end();
console.log('OK', OUT);
