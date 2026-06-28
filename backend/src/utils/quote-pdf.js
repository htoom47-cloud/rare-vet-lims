const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
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

const fmtMoney = (n) => `${parseFloat(n || 0).toFixed(2)} SAR`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

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
  cellLatin(doc, `${labelEn}: ${val}`, MARGIN + 8, y + 5, half - 16, { size: 8 });
  const labelW = 68;
  cellArabic(doc, `${labelAr}:`, mid + half - labelW - 8, y + 5, labelW, { size: 8, align: 'right' });
  cellLatin(doc, val, mid + 8, y + 5, half - labelW - 20, { size: 8, align: 'left' });
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

const generateQuotePDF = async (quote, outputDir, options = {}) => {
  const settings = mergeInvoiceSettings(options.settings);
  activeBrand = brandFromSettings(settings);
  const lab = settings.lab;
  const showLogo = settings.design.show_logo !== false && HAS_LOGO;

  const filename = options.filename || `quote-${quote.quote_number}.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const { customerEn, customerAr } = resolveBilingualCustomer(quote.customer_name, quote.customer_name_ar);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    registerPdfFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let y = MARGIN;
    const LOGO_SIZE = 46;

    if (showLogo) {
      const logoX = (PAGE_W - LOGO_SIZE) / 2;
      const leftW = logoX - MARGIN - 8;
      const rightX = logoX + LOGO_SIZE + 8;
      const rightW = PAGE_W - MARGIN - rightX;
      try { doc.image(LOGO_PATH, logoX, y, { width: LOGO_SIZE, height: LOGO_SIZE }); } catch { /* */ }
      cellLatin(doc, lab.name, MARGIN, y + 8, leftW, { size: 9, bold: true });
      cellArabic(doc, lab.name_ar, rightX, y + 8, rightW, { size: 11, bold: true, align: 'right' });
      cellLatin(doc, lab.subtitle, MARGIN, y + 24, leftW, { size: 7, color: activeBrand.muted });
      cellArabic(doc, lab.subtitle_ar || '', rightX, y + 24, rightW, { size: 7, color: activeBrand.muted, align: 'right' });
      y += LOGO_SIZE + 6;
    } else {
      const half = TW / 2;
      cellLatin(doc, lab.name, MARGIN, y + 4, half, { size: 9, bold: true });
      cellArabic(doc, lab.name_ar, MARGIN + half, y + 4, half, { size: 11, bold: true, align: 'right' });
      y += 18;
      cellLatin(doc, lab.subtitle, MARGIN, y, half, { size: 7, color: activeBrand.muted });
      cellArabic(doc, lab.subtitle_ar || '', MARGIN + half, y, half, { size: 7, color: activeBrand.muted, align: 'right' });
      y += 16;
    }

    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1.5).strokeColor(activeBrand.gold).stroke();
    y += 8;

    y = bilingualBar(doc, MARGIN, y, TW, 22, 'Price Quotation', 'عرض سعر', activeBrand.brown) + 6;

    const metaH = quote.valid_until ? 54 : 38;
    strokeBox(doc, MARGIN, y, TW, metaH, activeBrand.cream);
    metaRow(doc, y, 16, 'Quote No', 'رقم العرض', quote.quote_number);
    metaRow(doc, y + 16, 16, 'Date', 'التاريخ', fmtDate(quote.created_at));
    if (quote.valid_until) {
      metaRow(doc, y + 32, 16, 'Valid Until', 'صالح حتى', fmtDate(quote.valid_until));
    }
    y += metaH + 8;

    const custH = (customerAr || quote.customer_mobile) ? 40 : 32;
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
    if (quote.customer_mobile) {
      cellLatin(doc, `Mobile: ${quote.customer_mobile}`, MARGIN + 8, y + 22, TW / 2 - 12, { size: 7.5 });
      cellArabic(doc, 'الجوال:', MARGIN + TW / 2 + 8, y + 22, 52, { size: 7.5, align: 'right' });
      cellLatin(doc, quote.customer_mobile, MARGIN + TW / 2 + 60, y + 22, TW / 2 - 68, { size: 7.5, align: 'right' });
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

    (quote.items || []).forEach((item, i) => {
      const desc = item.description || item.test_name || '-';
      y = drawTableRow(doc, [
        { w: 24, text: String(i + 1), align: 'center' },
        { w: colDesc, text: desc, arabic: hasArabic(desc), align: hasArabic(desc) ? 'right' : 'left' },
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
    totalLine('Subtotal', 'المجموع الفرعي', fmtMoney(quote.subtotal));
    if (parseFloat(quote.discount_amount) > 0) {
      const pct = parseFloat(quote.discount_percent) || 0;
      const discEn = pct > 0 ? `Discount (${pct}%)` : 'Discount';
      const discAr = pct > 0 ? `خصم (${pct}%)` : 'الخصم';
      totalLine(discEn, discAr, `- ${fmtMoney(quote.discount_amount)}`);
    }
    totalLine(`VAT ${quote.tax_rate || 15}%`, `ضريبة ${quote.tax_rate || 15}%`, fmtMoney(quote.tax_amount));
    totalLine('Total', 'الإجمالي', fmtMoney(quote.total), true);

    if (quote.notes) {
      y += 10;
      y = bilingualBar(doc, MARGIN, y, TW, 18, 'Notes', 'ملاحظات', activeBrand.cream, { size: 7.5, color: activeBrand.brown }) + 4;
      const notesH = 36;
      strokeBox(doc, MARGIN, y, TW, notesH);
      if (hasArabic(quote.notes)) {
        cellArabic(doc, quote.notes, MARGIN + 8, y + 6, TW - 16, { size: 7.5, align: 'right' });
      } else {
        cellLatin(doc, quote.notes, MARGIN + 8, y + 6, TW - 16, { size: 7.5 });
      }
      y += notesH;
    }

    const footerY = 780;
    cellLatin(doc, `VAT No: ${lab.vat_number}`, MARGIN, footerY, TW, { size: 7, color: activeBrand.muted });
    cellLatin(doc, `${lab.phone}  |  ${lab.email}`, MARGIN, footerY + 12, TW, { size: 7, color: activeBrand.muted });
    if (lab.address) {
      cellLatin(doc, lab.address, MARGIN, footerY + 24, TW, { size: 7, color: activeBrand.muted });
    }
    cellLatin(
      doc,
      'This quotation is for informational purposes and does not constitute a tax invoice.',
      MARGIN,
      footerY + 36,
      TW,
      { size: 6.5, color: activeBrand.muted }
    );
    cellArabic(
      doc,
      'هذا العرض للمعلومات فقط ولا يُعد فاتورة ضريبية.',
      MARGIN,
      footerY + 48,
      TW,
      { size: 7,
        color: activeBrand.muted,
        align: 'center' }
    );

    doc.end();
    stream.on('finish', () => resolve({ filePath, filename, url: `/uploads/quotes/${filename}` }));
    stream.on('error', reject);
  });
};

module.exports = { generateQuotePDF };
