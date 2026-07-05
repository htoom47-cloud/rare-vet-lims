const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { drawArBox, drawEn, registerPdfFonts, hasArabic, resolveBilingualCustomer } = require('./pdf-arabic');
const { mergeInvoiceSettings } = require('./invoice-settings');
const { bilingualMetaRow, drawCustomerBlock, drawBilingualTableHeader } = require('./pdf-billing-layout');
const { HAS_LOGO, DEFAULT_LOGO_SIZE, getBrandLogoBuffer, drawBillingHeaderLogo } = require('./pdf-logo');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

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

const metaRow = (doc, y, rowH, labelEn, labelAr, value) => {
  bilingualMetaRow(doc, layoutCtx(doc), y, rowH, labelEn, labelAr, value);
};

const layoutCtx = (doc) => ({
  MARGIN, TW, activeBrand, strokeBox, cellLatin, cellArabic,
});

const drawTableHeader = (doc, cols, y) => drawBilingualTableHeader(doc, layoutCtx(doc), cols, y);

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
  const logoBuf = showLogo ? await getBrandLogoBuffer(activeBrand.brown) : null;
  const LOGO_SIZE = DEFAULT_LOGO_SIZE;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    registerPdfFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let y = MARGIN;

    if (showLogo && logoBuf) {
      const layout = drawBillingHeaderLogo(doc, logoBuf, PAGE_W, MARGIN, y, LOGO_SIZE);
      if (layout) {
        cellLatin(doc, lab.name, MARGIN, y + 10, layout.leftW, { size: 9, bold: true });
        cellArabic(doc, lab.name_ar, layout.rightX, y + 10, layout.rightW, { size: 11, bold: true, align: 'right' });
        cellLatin(doc, lab.subtitle, MARGIN, y + 26, layout.leftW, { size: 7, color: activeBrand.muted });
        cellArabic(doc, lab.subtitle_ar || '', layout.rightX, y + 26, layout.rightW, { size: 7, color: activeBrand.muted, align: 'right' });
        y += layout.headerH;
      }
    } else if (showLogo) {
      const logoX = (PAGE_W - LOGO_SIZE) / 2;
      const leftW = logoX - MARGIN - 8;
      const rightX = logoX + LOGO_SIZE + 8;
      const rightW = PAGE_W - MARGIN - rightX;
      try { doc.image(LOGO_PATH, logoX, y, { width: LOGO_SIZE, height: LOGO_SIZE }); } catch { /* */ }
      cellLatin(doc, lab.name, MARGIN, y + 10, leftW, { size: 9, bold: true });
      cellArabic(doc, lab.name_ar, rightX, y + 10, rightW, { size: 11, bold: true, align: 'right' });
      cellLatin(doc, lab.subtitle, MARGIN, y + 26, leftW, { size: 7, color: activeBrand.muted });
      cellArabic(doc, lab.subtitle_ar || '', rightX, y + 26, rightW, { size: 7, color: activeBrand.muted, align: 'right' });
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

    y = drawCustomerBlock(doc, layoutCtx(doc), y, customerEn, customerAr, quote.customer_mobile) + 8;

    const colDesc = TW - 24 - 52 - 58 - 58;
    const tableCols = [
      { w: 24, en: '#', ar: '#' },
      { w: colDesc, en: 'Description', ar: 'الوصف' },
      { w: 52, en: 'Qty', ar: 'الكمية' },
      { w: 58, en: 'Unit excl.', ar: 'الوحدة (بدون ض.)' },
      { w: 58, en: 'Total excl.', ar: 'الإجمالي (بدون ض.)' },
    ];
    y = drawTableHeader(doc, tableCols, y);

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
    totalLine('Subtotal excl. VAT', 'المجموع (بدون ضريبة)', fmtMoney(quote.subtotal));
    if (parseFloat(quote.discount_amount) > 0) {
      const pct = parseFloat(quote.discount_percent) || 0;
      const discEn = pct > 0 ? `Services discount (${pct}%)` : 'Services discount';
      const discAr = pct > 0 ? `خصم الخدمات (${pct}%)` : 'خصم الخدمات';
      totalLine(discEn, discAr, `- ${fmtMoney(quote.discount_amount)}`);
    }
    if (parseFloat(quote.field_visit_discount_amount) > 0) {
      const pct = parseFloat(quote.field_visit_discount_percent) || 0;
      const discEn = pct > 0 ? `Field visit discount (${pct}%)` : 'Field visit discount';
      const discAr = pct > 0 ? `خصم الزيارة الميدانية (${pct}%)` : 'خصم الزيارة الميدانية';
      totalLine(discEn, discAr, `- ${fmtMoney(quote.field_visit_discount_amount)}`);
    }
    totalLine(`VAT ${quote.tax_rate || 15}%`, `ضريبة القيمة المضافة ${quote.tax_rate || 15}%`, fmtMoney(quote.tax_amount));
    totalLine('Total incl. VAT', 'الإجمالي شامل الضريبة', fmtMoney(quote.total), true);

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
