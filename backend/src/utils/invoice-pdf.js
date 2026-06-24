const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const env = require('../config/env');
const { drawArBox, drawEn, registerPdfFonts } = require('./pdf-arabic');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const MARGIN = 36;
const PAGE_W = 595;
const TW = PAGE_W - MARGIN * 2;

const BRAND = {
  brown: '#5B3A29',
  gold: '#C9A86A',
  cream: '#F7F5F2',
  border: '#e8e0d8',
  muted: '#6b5344',
};

const STATUS_LABEL = {
  draft: { ar: 'مسودة', en: 'Draft' },
  issued: { ar: 'صادرة', en: 'Issued' },
  paid: { ar: 'مدفوعة', en: 'Paid' },
  partial: { ar: 'مدفوعة جزئياً', en: 'Partial' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
  refunded: { ar: 'مستردة', en: 'Refunded' },
};

const PAYMENT_LABEL = {
  cash: { ar: 'نقدي', en: 'Cash' },
  card: { ar: 'بطاقة', en: 'Card' },
  bank_transfer: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
  credit: { ar: 'آجل / حساب', en: 'Credit' },
};

const fmtMoney = (n) => `${parseFloat(n || 0).toFixed(2)} SAR`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

const drawBanner = (doc, y, textAr, textEn) => {
  const h = 22;
  doc.rect(MARGIN, y, TW, h).fill(BRAND.brown);
  drawEn(doc, textEn, MARGIN + 8, y + 6, { size: 8, color: '#fff', bold: true });
  drawArBox(doc, textAr, MARGIN, y + 6, TW - 8, { size: 8, color: '#fff', bold: true, align: 'right', fromTop: true });
  return y + h;
};

const drawRow = (doc, cols, y, h, opts = {}) => {
  const { header = false, fill } = opts;
  let x = MARGIN;
  cols.forEach(({ w, text, ar, align }) => {
    if (fill) doc.rect(x, y, w, h).fill(fill);
    doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(BRAND.border).stroke();
    const color = header ? '#fff' : BRAND.brown;
    if (header) doc.rect(x, y, w, h).fill(BRAND.brown);
    if (ar) {
      drawArBox(doc, text, x + 2, y + 3, w - 4, { size: 7, color, bold: header, align: align || 'right', fromTop: true });
    } else {
      drawEn(doc, text, x + 3, y + 3, { size: 7, color, bold: header, width: w - 6, align: align || 'left', fromTop: true });
    }
    x += w;
  });
  return y + h;
};

const generateInvoicePDF = async (invoice, outputDir, options = {}) => {
  const filename = options.filename || `invoice-${invoice.invoice_number}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const totalPaid = parseFloat(invoice.total_paid || 0);
  const balanceDue = Math.max(0, parseFloat(invoice.total) - totalPaid);
  const status = STATUS_LABEL[invoice.status] || STATUS_LABEL.issued;

  let qrDataUrl = null;
  if (invoice.vat_qr_data) {
    try {
      qrDataUrl = await QRCode.toDataURL(invoice.vat_qr_data, { width: 140, margin: 1 });
    } catch { /* skip QR */ }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    registerPdfFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let y = MARGIN;

    if (HAS_LOGO) {
      try { doc.image(LOGO_PATH, PAGE_W - MARGIN - 42, y, { width: 42, height: 42 }); } catch { /* */ }
    }
    drawArBox(doc, env.lab.nameAr, MARGIN, y, TW - 50, { size: 12, bold: true, align: 'right', fromTop: true });
    y += 16;
    drawEn(doc, env.lab.name, MARGIN, y, { size: 8, color: BRAND.muted, width: TW - 50, align: 'right', fromTop: true });
    y += 14;
    drawEn(doc, env.lab.subtitle, MARGIN, y, { size: 7, color: BRAND.muted, width: TW - 50, align: 'right', fromTop: true });
    y += 18;

    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1.5).strokeColor(BRAND.gold).stroke();
    y += 8;

    y = drawBanner(doc, y, 'فاتورة ضريبية مبسطة', 'SIMPLIFIED TAX INVOICE');
    y += 6;

    const metaH = 52;
    doc.rect(MARGIN, y, TW, metaH).fill(BRAND.cream);
    doc.rect(MARGIN, y, TW, metaH).lineWidth(0.5).strokeColor(BRAND.border).stroke();
    drawArBox(doc, `رقم الفاتورة: ${invoice.invoice_number}`, MARGIN + 8, y + 8, TW / 2, { size: 8, bold: true, align: 'right', fromTop: true });
    drawEn(doc, `Invoice No: ${invoice.invoice_number}`, MARGIN + TW / 2, y + 8, { size: 8, bold: true, fromTop: true });
    drawArBox(doc, `التاريخ: ${fmtDate(invoice.created_at)}`, MARGIN + 8, y + 22, TW / 2, { size: 7.5, align: 'right', fromTop: true });
    drawEn(doc, `Date: ${fmtDate(invoice.created_at)}`, MARGIN + TW / 2, y + 22, { size: 7.5, fromTop: true });
    drawArBox(doc, `الحالة: ${status.ar}`, MARGIN + 8, y + 36, TW / 2, { size: 7.5, align: 'right', fromTop: true });
    drawEn(doc, `Status: ${status.en}`, MARGIN + TW / 2, y + 36, { size: 7.5, fromTop: true });
    y += metaH + 8;

    doc.rect(MARGIN, y, TW, 36).strokeColor(BRAND.border).stroke();
    drawArBox(doc, `العميل: ${invoice.customer_name || '-'}`, MARGIN + 8, y + 6, TW - 16, { size: 8, bold: true, align: 'right', fromTop: true });
    drawEn(doc, `Customer: ${invoice.customer_name || '-'}`, MARGIN + 8, y + 20, { size: 7.5, fromTop: true });
    if (invoice.customer_mobile) {
      drawEn(doc, `Mobile: ${invoice.customer_mobile}`, MARGIN + TW / 2, y + 20, { size: 7.5, fromTop: true });
    }
    y += 44;

    const cols = [
      { w: 24, text: '#', align: 'center' },
      { w: TW - 24 - 52 - 40 - 58 - 58, text: 'الوصف / Description', ar: true },
      { w: 52, text: 'الكمية', ar: true, align: 'center' },
      { w: 58, text: 'السعر', ar: true, align: 'center' },
      { w: 58, text: 'الإجمالي', ar: true, align: 'center' },
    ];
    y = drawRow(doc, cols, y, 16, { header: true });

    (invoice.items || []).forEach((item, i) => {
      const desc = item.description || item.test_name || '-';
      const animal = item.name_tag ? ` (${item.name_tag})` : '';
      y = drawRow(doc, [
        { w: 24, text: String(i + 1), align: 'center' },
        { w: cols[1].w, text: `${desc}${animal}`, ar: /[\u0600-\u06FF]/.test(desc) },
        { w: 52, text: String(item.quantity), align: 'center' },
        { w: 58, text: parseFloat(item.unit_price).toFixed(2), align: 'center' },
        { w: 58, text: parseFloat(item.total_price).toFixed(2), align: 'center' },
      ], y, 18);
    });

    y += 8;
    const totalsX = MARGIN + TW - 200;
    const totalsW = 200;
    const line = (labelAr, labelEn, val, bold = false) => {
      doc.rect(totalsX, y, totalsW, 16).fill('#faf8f5').strokeColor(BRAND.border).stroke();
      drawArBox(doc, labelAr, totalsX + 4, y + 3, 90, { size: 7, bold, align: 'right', fromTop: true });
      drawEn(doc, val, totalsX + 96, y + 3, { size: 7, bold, width: 100, align: 'right', fromTop: true });
      y += 16;
    };
    line('المجموع الفرعي', 'Subtotal', fmtMoney(invoice.subtotal));
    if (parseFloat(invoice.discount_amount) > 0) {
      line('الخصم', 'Discount', `- ${fmtMoney(invoice.discount_amount)}`);
    }
    line(`ضريبة ${invoice.tax_rate || 15}%`, `VAT ${invoice.tax_rate || 15}%`, fmtMoney(invoice.tax_amount));
    line('الإجمالي', 'Total', fmtMoney(invoice.total), true);
    if (totalPaid > 0) line('المدفوع', 'Paid', fmtMoney(totalPaid));
    if (balanceDue > 0.009) line('المتبقي', 'Balance Due', fmtMoney(balanceDue), true);

    if ((invoice.payments || []).length > 0) {
      y += 10;
      drawArBox(doc, 'سجل المدفوعات', MARGIN, y, TW, { size: 8, bold: true, align: 'right', fromTop: true });
      y += 14;
      invoice.payments.forEach((p) => {
        const lbl = PAYMENT_LABEL[p.method] || { ar: p.method, en: p.method };
        const row = `${fmtDate(p.created_at)}  |  ${lbl.ar}  |  ${fmtMoney(p.amount)}${p.reference_number ? `  |  Ref: ${p.reference_number}` : ''}`;
        drawEn(doc, row, MARGIN, y, { size: 7, width: TW, fromTop: true });
        y += 12;
      });
    }

    const footerY = 780;
    if (qrDataUrl) {
      try {
        const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(b64, 'base64'), MARGIN, footerY - 10, { width: 64, height: 64 });
      } catch { /* */ }
    }
    drawEn(doc, `VAT No: ${env.lab.vatNumber}`, MARGIN + 72, footerY, { size: 7, color: BRAND.muted, fromTop: true });
    drawEn(doc, `${env.lab.phone}  |  ${env.lab.email}`, MARGIN + 72, footerY + 12, { size: 7, color: BRAND.muted, fromTop: true });
    drawArBox(doc, env.lab.nameAr, MARGIN, footerY + 28, TW, { size: 7, color: BRAND.muted, align: 'center', fromTop: true });

    doc.end();
    stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/invoices/${filename}` }));
    stream.on('error', reject);
  });
};

module.exports = { generateInvoicePDF, PAYMENT_LABEL };
