const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { drawArBox, drawEn, registerPdfFonts, hasArabic, resolveBilingualCustomer } = require('./pdf-arabic');
const { mergeInvoiceSettings } = require('./invoice-settings');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const MARGIN = 36;
const PAGE_W = 595;
const TW = PAGE_W - MARGIN * 2;

const DEFAULT_BRAND = {
  brown: '#5B3A29',
  gold: '#C9A86A',
  cream: '#F7F5F2',
  border: '#e8e0d8',
  muted: '#6b5344',
};

let activeBrand = DEFAULT_BRAND;

const brandFromSettings = (settings) => ({
  brown: settings?.design?.primary_color || DEFAULT_BRAND.brown,
  gold: settings?.design?.accent_color || DEFAULT_BRAND.gold,
  cream: settings?.design?.cream_color || DEFAULT_BRAND.cream,
  border: DEFAULT_BRAND.border,
  muted: DEFAULT_BRAND.muted,
});

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

const pinY = (doc, y) => { doc.y = y; };

const cellLatin = (doc, text, x, y, w, opts = {}) => {
  const { size = 7.5, color = activeBrand.brown, bold = false, align = 'left' } = opts;
  const savedY = doc.y;
  drawEn(doc, String(text ?? ''), x, y, { size, color, bold, width: w, align, fromTop: true });
  pinY(doc, savedY);
};

const cellArabic = (doc, text, x, y, w, opts = {}) => {
  const { size = 7.5, color = activeBrand.brown, bold = false, align = 'right' } = opts;
  const str = String(text ?? '').trim();
  if (!str) return;
  const savedY = doc.y;
  drawArBox(doc, str, x, y, w, { size, color, bold, align, fromTop: true });
  pinY(doc, savedY);
};

const strokeBox = (doc, x, y, w, h, fill) => {
  if (fill) doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(activeBrand.border).stroke();
};

/** English left half + Arabic right half — never mixed in one draw call */
const bilingualBar = (doc, x, y, w, h, textEn, textAr, bg, opts = {}) => {
  const { size = 8, color = '#fff' } = opts;
  doc.rect(x, y, w, h).fill(bg);
  doc.rect(x, y, w, h).strokeColor(activeBrand.border).stroke();
  const half = w / 2;
  const padY = y + Math.max(2, (h - size) / 2);
  cellLatin(doc, textEn, x + 8, padY, half - 12, { size, color, bold: true });
  cellArabic(doc, textAr, x + half + 4, padY, half - 12, { size, color, bold: true, align: 'right' });
  return y + h;
};

const metaRow = (doc, y, h, labelEn, labelAr, value) => {
  const mid = MARGIN + TW / 2;
  const half = TW / 2;
  const val = String(value ?? '-');
  cellLatin(doc, `${labelEn}: ${val}`, MARGIN + 8, y + 5, half - 16, h, { size: 8 });
  const labelW = 68;
  cellArabic(doc, `${labelAr}:`, mid + half - labelW - 8, y + 5, labelW, h, { size: 8, align: 'right' });
  cellLatin(doc, val, mid + 8, y + 5, half - labelW - 20, h, { size: 8, align: 'left' });
};

const drawTableHeader = (doc, cols, y, h) => {
  let x = MARGIN;
  cols.forEach((col) => {
    doc.rect(x, y, col.w, h).fill(activeBrand.brown);
    doc.rect(x, y, col.w, h).lineWidth(0.4).strokeColor(activeBrand.border).stroke();
    if (col.ar) {
      cellArabic(doc, col.ar, x + 2, y + 3, col.w - 4, { size: 7, color: '#fff', bold: true, align: 'center' });
    }
    if (col.en) {
      cellLatin(doc, col.en, x + 2, y + (col.ar ? 10 : 3), col.w - 4, { size: 6.5, color: '#fff', bold: true, align: 'center' });
    }
    x += col.w;
  });
  return y + h;
};

const drawTableRow = (doc, cols, y, h, fill) => {
  let x = MARGIN;
  cols.forEach((col) => {
    strokeBox(doc, x, y, col.w, h, fill);
    if (col.arabic) {
      cellArabic(doc, col.text, x + 2, y + 3, col.w - 4, { size: 7, align: col.align || 'right' });
    } else {
      cellLatin(doc, col.text, x + 2, y + 3, col.w - 4, { size: 7, align: col.align || 'left' });
    }
    x += col.w;
  });
  return y + h;
};

const generateInvoicePDF = async (invoice, outputDir, options = {}) => {
  const settings = mergeInvoiceSettings(options.settings);
  activeBrand = brandFromSettings(settings);
  const lab = settings.lab;
  const showLogo = settings.design.show_logo !== false && HAS_LOGO;
  const showQr = settings.options.show_qr !== false;
  const showPayments = settings.options.show_payment_history !== false;

  const filename = options.filename || `invoice-${invoice.invoice_number}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const totalPaid = parseFloat(invoice.total_paid || 0);
  const balanceDue = Math.max(0, parseFloat(invoice.total) - totalPaid);
  const status = STATUS_LABEL[invoice.status] || STATUS_LABEL.issued;
  const { customerEn, customerAr } = resolveBilingualCustomer(invoice.customer_name, invoice.customer_name_ar);

  let qrDataUrl = null;
  if (showQr && invoice.vat_qr_data) {
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
    const headerTextW = TW - 50;
    const half = headerTextW / 2;

    if (showLogo) {
      try { doc.image(LOGO_PATH, PAGE_W - MARGIN - 42, y, { width: 42, height: 42 }); } catch { /* */ }
    }
    cellLatin(doc, lab.name, MARGIN, y + 4, half, { size: 9, bold: true });
    cellArabic(doc, lab.name_ar, MARGIN + half, y + 4, half, { size: 11, bold: true, align: 'right' });
    y += 18;
    cellLatin(doc, lab.subtitle, MARGIN, y, half, { size: 7, color: activeBrand.muted });
    cellArabic(doc, lab.subtitle_ar || '', MARGIN + half, y, half, { size: 7, color: activeBrand.muted, align: 'right' });
    y += 16;

    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1.5).strokeColor(activeBrand.gold).stroke();
    y += 8;

    y = bilingualBar(doc, MARGIN, y, TW, 22, settings.labels.title_en, settings.labels.title_ar, activeBrand.brown) + 6;

    const metaH = 54;
    strokeBox(doc, MARGIN, y, TW, metaH, activeBrand.cream);
    metaRow(doc, y, 16, 'Invoice No', 'رقم الفاتورة', invoice.invoice_number);
    metaRow(doc, y + 16, 16, 'Date', 'التاريخ', fmtDate(invoice.created_at));
    metaRow(doc, y + 32, 16, 'Status', 'الحالة', `${status.en} / ${status.ar}`);
    y += metaH + 8;

    const custH = (customerAr || invoice.customer_mobile) ? 40 : 32;
    strokeBox(doc, MARGIN, y, TW, custH);
    cellLatin(doc, 'Customer:', MARGIN + 8, y + 6, 58, { size: 8, bold: true });
    if (customerEn) {
      cellLatin(doc, customerEn, MARGIN + 66, y + 6, TW / 2 - 74, { size: 8, bold: true });
    }
    cellArabic(doc, 'العميل:', MARGIN + TW / 2 + 8, y + 6, 52, { size: 8, bold: true, align: 'right' });
    if (customerAr) {
      cellArabic(doc, customerAr, MARGIN + TW / 2 + 60, y + 6, TW / 2 - 68, { size: 8, bold: true, align: 'right' });
    } else if (customerEn) {
      cellLatin(doc, customerEn, MARGIN + TW / 2 + 60, y + 6, TW / 2 - 68, { size: 8, bold: true, align: 'right' });
    }
    if (invoice.customer_mobile) {
      cellLatin(doc, `Mobile: ${invoice.customer_mobile}`, MARGIN + 8, y + 22, TW / 2 - 12, { size: 7.5 });
      cellArabic(doc, 'الجوال:', MARGIN + TW / 2 + 8, y + 22, 52, { size: 7.5, align: 'right' });
      cellLatin(doc, invoice.customer_mobile, MARGIN + TW / 2 + 60, y + 22, TW / 2 - 68, { size: 7.5, align: 'right' });
    }
    y += custH + 8;

    const colDesc = TW - 24 - 52 - 58 - 58;
    const tableCols = [
      { w: 24, en: '#', ar: '#' },
      { w: colDesc, en: 'Description', ar: 'الوصف' },
      { w: 52, en: 'Qty', ar: 'الكمية' },
      { w: 58, en: 'Price', ar: 'السعر' },
      { w: 58, en: 'Total', ar: 'الإجمالي' },
    ];
    y = drawTableHeader(doc, tableCols, y, 22);

    (invoice.items || []).forEach((item, i) => {
      const desc = item.description || item.test_name || '-';
      const animal = item.name_tag ? ` (${item.name_tag})` : '';
      const fullDesc = `${desc}${animal}`;
      y = drawTableRow(doc, [
        { w: 24, text: String(i + 1), align: 'center' },
        { w: colDesc, text: fullDesc, arabic: hasArabic(fullDesc), align: hasArabic(fullDesc) ? 'right' : 'left' },
        { w: 52, text: String(item.quantity), align: 'center' },
        { w: 58, text: parseFloat(item.unit_price).toFixed(2), align: 'center' },
        { w: 58, text: parseFloat(item.total_price).toFixed(2), align: 'center' },
      ], y, 18);
    });

    y += 8;
    const totalsX = MARGIN + TW - 210;
    const totalsW = 210;
    const labelW = 100;
    const totalLine = (labelEn, labelAr, val, bold = false) => {
      strokeBox(doc, totalsX, y, totalsW, 16, '#faf8f5');
      cellLatin(doc, labelEn, totalsX + 4, y + 3, 48, { size: 7, bold });
      cellLatin(doc, val, totalsX + totalsW - 72, y + 3, 68, { size: 7, bold, align: 'right' });
      cellArabic(doc, labelAr, totalsX + 52, y + 3, labelW, { size: 7, bold, align: 'right' });
      y += 16;
    };
    totalLine('Subtotal', 'المجموع الفرعي', fmtMoney(invoice.subtotal));
    if (parseFloat(invoice.discount_amount) > 0) {
      totalLine('Discount', 'الخصم', `- ${fmtMoney(invoice.discount_amount)}`);
    }
    totalLine(`VAT ${invoice.tax_rate || 15}%`, `ضريبة ${invoice.tax_rate || 15}%`, fmtMoney(invoice.tax_amount));
    totalLine('Total', 'الإجمالي', fmtMoney(invoice.total), true);
    if (totalPaid > 0) totalLine('Paid', 'المدفوع', fmtMoney(totalPaid));
    if (balanceDue > 0.009) totalLine('Balance Due', 'المتبقي', fmtMoney(balanceDue), true);

    if (showPayments && (invoice.payments || []).length > 0) {
      y += 10;
      y = bilingualBar(doc, MARGIN, y, TW, 18, 'Payment History', 'سجل المدفوعات', activeBrand.cream, { size: 7.5, color: activeBrand.brown }) + 4;
      invoice.payments.forEach((p) => {
        const lbl = PAYMENT_LABEL[p.method] || { ar: p.method, en: p.method };
        const rowH = 14;
        strokeBox(doc, MARGIN, y, TW, rowH);
        cellLatin(
          doc,
          `${fmtDate(p.created_at)}  |  ${lbl.en}  |  ${fmtMoney(p.amount)}${p.reference_number ? `  |  Ref: ${p.reference_number}` : ''}`,
          MARGIN + 6,
          y + 3,
          TW / 2 - 8,
          { size: 7 }
        );
        cellArabic(doc, lbl.ar, MARGIN + TW / 2 + 6, y + 3, TW / 2 - 12, { size: 7, align: 'right' });
        y += rowH;
      });
    }

    const footerY = 780;
    if (qrDataUrl) {
      try {
        const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        doc.image(Buffer.from(b64, 'base64'), MARGIN, footerY - 10, { width: 64, height: 64 });
      } catch { /* */ }
    }
    cellLatin(doc, `VAT No: ${lab.vat_number}`, MARGIN + 72, footerY, TW - 80, { size: 7, color: activeBrand.muted });
    cellLatin(doc, `${lab.phone}  |  ${lab.email}`, MARGIN + 72, footerY + 12, TW - 80, { size: 7, color: activeBrand.muted });
    if (lab.address) {
      cellLatin(doc, lab.address, MARGIN + 72, footerY + 24, TW - 80, { size: 7, color: activeBrand.muted });
    }
    if (settings.footer.note_en) {
      cellLatin(doc, settings.footer.note_en, MARGIN + 72, footerY + 36, TW - 80, { size: 7, color: activeBrand.muted });
    }
    if (settings.footer.note_ar) {
      cellArabic(doc, settings.footer.note_ar, MARGIN, footerY + (lab.address ? 48 : 36), TW, { size: 7, color: activeBrand.muted, align: 'center' });
    } else {
      cellArabic(doc, lab.name_ar, MARGIN, footerY + 28, TW, { size: 7, color: activeBrand.muted, align: 'center' });
    }

    doc.end();
    stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/invoices/${filename}` }));
    stream.on('error', reject);
  });
};

module.exports = { generateInvoicePDF, PAYMENT_LABEL };
