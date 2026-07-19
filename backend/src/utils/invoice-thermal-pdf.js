const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { drawArBox, drawEn, registerPdfFonts, hasArabic, resolveBilingualCustomer } = require('./pdf-arabic');
const { mergeInvoiceSettings } = require('./invoice-settings');
const { HAS_LOGO, getBrandLogoBuffer } = require('./pdf-logo');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

/** 80mm roll ≈ 226.77 pt */
const PAGE_W = 227;
const MARGIN = 8;
const TW = PAGE_W - MARGIN * 2;

const STATUS_LABEL = {
  draft: { ar: 'مسودة', en: 'Draft' },
  issued: { ar: 'صادرة', en: 'Issued' },
  paid: { ar: 'مدفوعة', en: 'Paid' },
  partial: { ar: 'مدفوعة جزئياً', en: 'Partial' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
  refunded: { ar: 'مستردة', en: 'Refunded' },
};

const fmtMoney = (n) => `${parseFloat(n || 0).toFixed(2)}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const estimateHeight = (invoice, { showQr, showPayments, showLogo }) => {
  const items = invoice.items || [];
  const payments = showPayments ? (invoice.payments || []) : [];
  let h = MARGIN;
  h += showLogo ? 52 : 36;
  h += 70; // title + meta
  h += 28; // customer
  h += 14 + items.length * 22;
  h += 70; // totals
  h += payments.length * 12;
  h += showQr ? 78 : 36;
  h += 40;
  return Math.max(320, Math.ceil(h));
};

const line = (doc, y, color = '#ccc') => {
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.6).strokeColor(color).stroke();
};

const generateThermalInvoicePDF = async (invoice, outputDir, options = {}) => {
  const settings = mergeInvoiceSettings(options.settings);
  const lab = settings.lab;
  const showLogo = settings.design.show_logo !== false && HAS_LOGO;
  const showQr = settings.options.show_qr !== false;
  const showPayments = settings.options.show_payment_history !== false;
  const brown = settings.design?.primary_color || '#5B3A29';
  const muted = '#666666';

  const filename = options.filename || `invoice-${invoice.invoice_number}-80mm.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const totalPaid = parseFloat(invoice.total_paid || 0);
  const balanceDue = Math.max(0, parseFloat(invoice.total) - totalPaid);
  const status = STATUS_LABEL[invoice.status] || STATUS_LABEL.issued;
  const { customerEn, customerAr } = resolveBilingualCustomer(invoice.customer_name, invoice.customer_name_ar);

  let qrDataUrl = null;
  if (showQr && invoice.vat_qr_data) {
    try {
      qrDataUrl = await QRCode.toDataURL(invoice.vat_qr_data, { width: 120, margin: 1 });
    } catch { /* skip */ }
  }

  const logoBuf = showLogo ? await getBrandLogoBuffer(brown) : null;
  const pageH = estimateHeight(invoice, { showQr: !!qrDataUrl, showPayments, showLogo });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, pageH], margin: 0 });
    registerPdfFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let y = MARGIN;

    if (showLogo && logoBuf) {
      const logoSize = 36;
      try {
        doc.image(logoBuf, (PAGE_W - logoSize) / 2, y, { width: logoSize, height: logoSize });
      } catch {
        try { doc.image(LOGO_PATH, (PAGE_W - logoSize) / 2, y, { width: logoSize, height: logoSize }); } catch { /* */ }
      }
      y += logoSize + 4;
    }

    drawArBox(doc, lab.name_ar || lab.name, MARGIN, y, TW, {
      size: 9, bold: true, color: brown, align: 'center', fromTop: true,
    });
    y += 14;
    if (lab.subtitle_ar || lab.subtitle) {
      const sub = lab.subtitle_ar || lab.subtitle;
      if (hasArabic(sub)) {
        drawArBox(doc, sub, MARGIN, y, TW, { size: 6.5, color: muted, align: 'center', fromTop: true });
      } else {
        drawEn(doc, sub, MARGIN, y, { size: 6.5, color: muted, width: TW, align: 'center', fromTop: true });
      }
      y += 11;
    }

    line(doc, y, brown);
    y += 6;

    drawArBox(doc, settings.labels.title_ar || 'فاتورة ضريبية مبسطة', MARGIN, y, TW, {
      size: 8, bold: true, color: brown, align: 'center', fromTop: true,
    });
    y += 13;
    drawEn(doc, settings.labels.title_en || 'TAX INVOICE', MARGIN, y, {
      size: 7, bold: true, color: brown, width: TW, align: 'center', fromTop: true,
    });
    y += 12;

    const meta = (label, value) => {
      drawEn(doc, `${label}: ${value}`, MARGIN, y, { size: 7, color: brown, width: TW, align: 'left', fromTop: true });
      y += 10;
    };
    meta('No', invoice.invoice_number);
    meta('Date', fmtDate(invoice.created_at));
    meta('Status', `${status.en} / ${status.ar}`);

    line(doc, y);
    y += 5;

    const cust = customerAr || customerEn || '-';
    if (hasArabic(cust)) {
      drawArBox(doc, cust, MARGIN, y, TW, { size: 8, bold: true, color: brown, align: 'right', fromTop: true });
    } else {
      drawEn(doc, cust, MARGIN, y, { size: 8, bold: true, color: brown, width: TW, align: 'left', fromTop: true });
    }
    y += 12;
    if (invoice.customer_mobile) {
      drawEn(doc, invoice.customer_mobile, MARGIN, y, {
        size: 7, color: muted, width: TW, align: 'center', fromTop: true,
      });
      y += 11;
    }

    line(doc, y);
    y += 5;

    drawEn(doc, 'Item', MARGIN, y, { size: 6.5, bold: true, color: muted, width: TW * 0.65, fromTop: true });
    drawEn(doc, 'SAR', MARGIN + TW * 0.65, y, {
      size: 6.5, bold: true, color: muted, width: TW * 0.35, align: 'right', fromTop: true,
    });
    y += 10;
    line(doc, y);
    y += 4;

    (invoice.items || []).forEach((item) => {
      const desc = item.description || item.test_name || '-';
      const tag = item.name_tag ? ` (${item.name_tag})` : '';
      const qty = parseFloat(item.quantity) || 1;
      const full = qty > 1 ? `${desc}${tag} x${qty}` : `${desc}${tag}`;
      const price = fmtMoney(item.total_price);

      if (hasArabic(full)) {
        drawArBox(doc, full, MARGIN, y, TW * 0.68, { size: 7, color: brown, align: 'right', fromTop: true });
      } else {
        drawEn(doc, full, MARGIN, y, { size: 7, color: brown, width: TW * 0.68, fromTop: true });
      }
      drawEn(doc, price, MARGIN + TW * 0.68, y, {
        size: 7, color: brown, width: TW * 0.32, align: 'right', fromTop: true,
      });
      y += 14;
      if (y > pageH - 100) {
        // content taller than estimate — rare; stay on page
      }
    });

    line(doc, y);
    y += 6;

    const totalRow = (labelAr, labelEn, val, bold = false) => {
      drawArBox(doc, labelAr, MARGIN, y, TW * 0.55, {
        size: 7, bold, color: brown, align: 'right', fromTop: true,
      });
      drawEn(doc, val, MARGIN + TW * 0.55, y, {
        size: 7, bold, color: brown, width: TW * 0.45, align: 'right', fromTop: true,
      });
      y += 11;
    };

    totalRow('المجموع بدون ضريبة', 'Subtotal', fmtMoney(invoice.subtotal));
    if (parseFloat(invoice.discount_amount) > 0) {
      totalRow('الخصم', 'Discount', `- ${fmtMoney(invoice.discount_amount)}`);
    }
    totalRow(`ضريبة ${invoice.tax_rate || 15}%`, `VAT ${invoice.tax_rate || 15}%`, fmtMoney(invoice.tax_amount));
    totalRow('الإجمالي', 'TOTAL', fmtMoney(invoice.total), true);
    if (totalPaid > 0) totalRow('المدفوع', 'Paid', fmtMoney(totalPaid));
    if (balanceDue > 0.009) totalRow('المتبقي', 'Balance', fmtMoney(balanceDue), true);

    if (showPayments && (invoice.payments || []).length > 0) {
      y += 4;
      line(doc, y);
      y += 5;
      invoice.payments.forEach((p) => {
        drawEn(doc, `${fmtDate(p.created_at).slice(0, 10)}  ${fmtMoney(p.amount)}  ${p.method || ''}`, MARGIN, y, {
          size: 6.5, color: muted, width: TW, align: 'center', fromTop: true,
        });
        y += 10;
      });
    }

    y += 6;
    line(doc, y, brown);
    y += 8;

    if (qrDataUrl) {
      try {
        const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const qrSize = 64;
        doc.image(Buffer.from(b64, 'base64'), (PAGE_W - qrSize) / 2, y, { width: qrSize, height: qrSize });
        y += qrSize + 6;
      } catch { /* */ }
    }

    if (lab.vat_number) {
      drawEn(doc, `VAT: ${lab.vat_number}`, MARGIN, y, {
        size: 6.5, color: muted, width: TW, align: 'center', fromTop: true,
      });
      y += 10;
    }
    if (lab.phone) {
      drawEn(doc, lab.phone, MARGIN, y, {
        size: 6.5, color: muted, width: TW, align: 'center', fromTop: true,
      });
      y += 10;
    }
    if (settings.footer.note_ar) {
      drawArBox(doc, settings.footer.note_ar, MARGIN, y, TW, {
        size: 6.5, color: muted, align: 'center', fromTop: true,
      });
    } else if (settings.footer.note_en) {
      drawEn(doc, settings.footer.note_en, MARGIN, y, {
        size: 6.5, color: muted, width: TW, align: 'center', fromTop: true,
      });
    }

    doc.end();
    stream.on('finish', () => resolve({
      filePath,
      filename,
      url: `/uploads/invoices/${filename}`,
    }));
    stream.on('error', reject);
  });
};

module.exports = { generateThermalInvoicePDF, THERMAL_PAGE_W: PAGE_W };
