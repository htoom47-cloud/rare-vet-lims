const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { registerPdfFonts, drawEn, drawArBox } = require('./pdf-arabic');

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

const generateClosingPDF = async (summary, closingNumber, outputDir) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${closingNumber}.pdf`;
  const filePath = path.join(outputDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    registerPdfFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let y = 40;
    drawArBox(doc, 'إقفال يومية المختبر', 40, y, 515, { size: 14, bold: true, align: 'center', fromTop: true });
    y += 24;
    drawEn(doc, 'Daily Closing Report', 40, y, { size: 11, width: 515, align: 'center', fromTop: true });
    y += 20;
    drawEn(doc, `Closing No: ${closingNumber}`, 40, y, { size: 9, fromTop: true });
    drawEn(doc, `Date: ${summary.date}`, 300, y, { size: 9, fromTop: true });
    y += 24;

    const rows = [
      ['Total Invoiced', 'إجمالي الفواتير', summary.invoiced_total],
      ['Cash', 'نقدي', summary.by_method?.cash || 0],
      ['Card / Network', 'شبكة', summary.by_method?.card || 0],
      ['Bank Transfer', 'تحويل بنكي', summary.by_method?.bank_transfer || 0],
      ['Credit / On Account', 'آجل', summary.by_method?.credit || 0],
      ['VAT 15%', 'ضريبة القيمة المضافة', summary.tax_total],
      ['Discounts', 'الخصومات', summary.discount_total],
      ['Net Collections', 'صافي التحصيل', summary.net_collections],
      ['Invoice Count', 'عدد الفواتير', summary.invoice_count],
      ['Unpaid Invoices', 'غير مدفوعة', summary.unpaid_count],
      ['Cancelled', 'ملغاة', summary.cancelled_count],
    ];

    rows.forEach(([en, ar, val]) => {
      const display = typeof val === 'number' && !Number.isInteger(val) ? fmt(val) : String(val);
      doc.rect(40, y, 515, 18).stroke('#e8e0d8');
      drawEn(doc, en, 44, y + 4, { size: 8, fromTop: true });
      drawArBox(doc, ar, 200, y + 4, 120, { size: 8, align: 'right', fromTop: true });
      drawEn(doc, display, 400, y + 4, { size: 8, width: 150, align: 'right', fromTop: true });
      y += 18;
    });

    doc.end();
    stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/closings/${filename}` }));
    stream.on('error', reject);
  });
};

module.exports = { generateClosingPDF };
