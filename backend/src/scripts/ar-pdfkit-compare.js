const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const arabicReshaper = require('arabic-reshaper');

const FONT = path.join(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf');
const OUT = path.join(__dirname, '../../uploads/reports/ar-pdfkit-compare.pdf');
const samples = ['صورة الدم', 'مركز رعاية النوادر البيطري', 'كرياتنين', 'المناعة'];
const rev = (s) => [...s].reverse().join('');

const doc = new PDFDocument({ size: 'A4', margin: 40 });
doc.pipe(fs.createWriteStream(OUT));
doc.registerFont('Ar', FONT);

let y = 40;
samples.forEach((t) => {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333').text(t, 40, y);
  y += 14;
  const shaped = arabicReshaper.convertArabic(t);
  const visual = rev(shaped);

  doc.font('Helvetica').fontSize(7).fillColor('#888').text('shaped only (no reverse)', 40, y);
  doc.font('Ar').fontSize(12).fillColor('#004');
  let tw = doc.widthOfString(shaped);
  doc.text(shaped, 500 - tw, y);
  y += 18;

  doc.font('Helvetica').fontSize(7).fillColor('#888').text('shaped + reverse', 40, y);
  doc.font('Ar').fontSize(12).fillColor('#060');
  tw = doc.widthOfString(visual);
  doc.text(visual, 500 - tw, y);
  y += 18;

  doc.font('Helvetica').fontSize(7).fillColor('#888').text('logical + rtla', 40, y);
  doc.font('Ar').fontSize(12).fillColor('#900');
  doc.text(t, 40, y, { width: 460, align: 'right', features: ['rtla'], lineBreak: false });
  y += 24;
});

doc.end();
console.log('OK', OUT);
