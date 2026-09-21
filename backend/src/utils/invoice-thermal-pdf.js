const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { drawArBox, drawEn, registerPdfFonts, hasArabic, resolveBilingualCustomer } = require('./pdf-arabic');
const { mergeInvoiceSettings } = require('./invoice-settings');
const { HAS_LOGO, getBrandLogoBuffer } = require('./pdf-logo');
const { aggregateThermalInvoiceItems } = require('./thermal-invoice-items');

const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');

/** 80mm roll ≈ 226.77 pt — keep width; enlarge inner margin so Epson does not clip glyphs. */
const PAGE_W = 227;
const MARGIN = 14;
const TW = PAGE_W - MARGIN * 2;
const INK = '#000000';

const STATUS_LABEL = {
  draft: { ar: 'مسودة', en: 'Draft' },
  issued: { ar: 'صادرة', en: 'Issued' },
  paid: { ar: 'مدفوعة', en: 'Paid' },
  partial: { ar: 'مدفوعة جزئياً', en: 'Partial' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
  refunded: { ar: 'مستردة', en: 'Refunded' },
};

const PAYMENT_METHOD_AR = {
  cash: 'نقدي',
  card: 'شبكة',
  bank_transfer: 'تحويل بنكي',
  credit: 'آجل',
};

const paymentMethodAr = (method) => {
  const key = String(method || '').trim().toLowerCase().replace(/\s+/g, '_');
  return PAYMENT_METHOD_AR[key] || String(method || '').trim();
};

const fmtMoney = (n) => `${parseFloat(n || 0).toFixed(2)}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const estimateHeight = (invoice, { showQr, showLogo }) => {
  const items = aggregateThermalInvoiceItems(invoice.items || []);
  let h = MARGIN;
  h += showLogo ? 58 : 40;
  h += 96;
  h += 32;
  h += 18 + items.length * 18;
  h += 92;
  h += showQr ? 88 : 40;
  h += 36;
  return Math.max(360, Math.ceil(h));
};

const line = (doc, y) => {
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1.2).strokeColor(INK).stroke();
};

const generateThermalInvoicePDF = async (invoice, outputDir, options = {}) => {
  const settings = mergeInvoiceSettings(options.settings);
  const lab = settings.lab;
  const showLogo = settings.design.show_logo !== false && HAS_LOGO;
  const showQr = settings.options.show_qr !== false;

  const filename = options.filename || `invoice-${invoice.invoice_number}-80mm.pdf`;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);

  const totalPaid = parseFloat(invoice.total_paid || 0);
  const balanceDue = Math.max(0, parseFloat(invoice.total) - totalPaid);
  const status = STATUS_LABEL[invoice.status] || STATUS_LABEL.issued;
  const { customerEn, customerAr } = resolveBilingualCustomer(invoice.customer_name, invoice.customer_name_ar);
  const lastPayment = (invoice.payments || []).slice(-1)[0];
  const methodLabel = paymentMethodAr(lastPayment?.method || invoice.payment_method || '');

  let qrDataUrl = null;
  if (showQr && invoice.vat_qr_data) {
    try {
      qrDataUrl = await QRCode.toDataURL(invoice.vat_qr_data, {
        width: 180, margin: 1, color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch { /* skip */ }
  }

  const logoBuf = showLogo ? await getBrandLogoBuffer(INK) : null;
  const pageH = estimateHeight(invoice, { showQr: !!qrDataUrl, showLogo });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, pageH], margin: 0 });
    registerPdfFonts(doc);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let y = MARGIN;

    if (showLogo && logoBuf) {
      const logoSize = 40;
      try {
        doc.image(logoBuf, (PAGE_W - logoSize) / 2, y, { width: logoSize, height: logoSize });
      } catch {
        try { doc.image(LOGO_PATH, (PAGE_W - logoSize) / 2, y, { width: logoSize, height: logoSize }); } catch { /* */ }
      }
      y += logoSize + 5;
    }

    drawArBox(doc, lab.name_ar || lab.name, MARGIN, y, TW, {
      size: 11, bold: true, color: INK, align: 'center', fromTop: true, scale: 4,
    });
    y += 16;
    if (lab.subtitle_ar || lab.subtitle) {
      const sub = lab.subtitle_ar || lab.subtitle;
      if (hasArabic(sub)) {
        drawArBox(doc, sub, MARGIN, y, TW, { size: 8, color: INK, align: 'center', fromTop: true, scale: 4 });
      } else {
        drawEn(doc, sub, MARGIN, y, { size: 8, color: INK, width: TW, align: 'center', fromTop: true, scale: 4 });
      }
      y += 12;
    }

    line(doc, y);
    y += 7;

    drawArBox(doc, settings.labels.title_ar || 'فاتورة ضريبية مبسطة', MARGIN, y, TW, {
      size: 10, bold: true, color: INK, align: 'center', fromTop: true, scale: 4,
    });
    y += 15;

    const metaRow = (labelAr, value) => {
      drawArBox(doc, labelAr, MARGIN + TW * 0.52, y, TW * 0.48, {
        size: 9, bold: true, color: INK, align: 'right', fromTop: true, scale: 4,
      });
      drawEn(doc, String(value || '-'), MARGIN, y, {
        size: 9, bold: true, color: INK, width: TW * 0.50, align: 'left', fromTop: true, scale: 4,
      });
      y += 13;
    };
    metaRow('رقم الفاتورة', invoice.invoice_number);
    metaRow('التاريخ', fmtDate(invoice.created_at));

    drawArBox(doc, 'الحالة', MARGIN + TW * 0.52, y, TW * 0.48, {
      size: 9, bold: true, color: INK, align: 'right', fromTop: true, scale: 4,
    });
    drawArBox(doc, status.ar, MARGIN, y, TW * 0.50, {
      size: 9, bold: true, color: INK, align: 'left', fromTop: true, scale: 4,
    });
    y += 13;

    line(doc, y);
    y += 6;

    const cust = customerAr || customerEn || '-';
    if (hasArabic(cust)) {
      drawArBox(doc, cust, MARGIN, y, TW, { size: 10, bold: true, color: INK, align: 'right', fromTop: true, scale: 4 });
    } else {
      drawEn(doc, cust, MARGIN, y, { size: 10, bold: true, color: INK, width: TW, align: 'left', fromTop: true, scale: 4 });
    }
    y += 14;
    if (invoice.customer_mobile) {
      drawEn(doc, invoice.customer_mobile, MARGIN, y, {
        size: 9, bold: true, color: INK, width: TW, align: 'center', fromTop: true, scale: 4,
      });
      y += 12;
    }

    line(doc, y);
    y += 6;

    const qtyW = 26;
    const priceW = 50;
    const nameW = TW - qtyW - priceW;
    const xPrice = MARGIN;
    const xQty = MARGIN + priceW;
    const xName = MARGIN + priceW + qtyW;

    drawArBox(doc, 'ريال', xPrice, y, priceW, {
      size: 8, bold: true, color: INK, align: 'left', fromTop: true, scale: 4,
    });
    drawArBox(doc, 'العدد', xQty, y, qtyW, {
      size: 8, bold: true, color: INK, align: 'center', fromTop: true, scale: 4,
    });
    drawArBox(doc, 'الصنف', xName, y, nameW, {
      size: 8, bold: true, color: INK, align: 'right', fromTop: true, scale: 4,
    });
    y += 12;
    line(doc, y);
    y += 5;

    aggregateThermalInvoiceItems(invoice.items || []).forEach((item) => {
      const qty = String(parseInt(item.quantity, 10) || 1);
      const name = item.description || '-';
      const price = fmtMoney(item.total_price);

      drawEn(doc, price, xPrice, y, {
        size: 10, bold: true, color: INK, width: priceW, align: 'left', fromTop: true, scale: 4,
      });
      drawEn(doc, qty, xQty, y, {
        size: 10, bold: true, color: INK, width: qtyW, align: 'center', fromTop: true, scale: 4,
      });
      if (hasArabic(name)) {
        drawArBox(doc, name, xName, y, nameW, { size: 9, bold: true, color: INK, align: 'right', fromTop: true, scale: 4 });
      } else {
        drawEn(doc, name, xName, y, { size: 9, bold: true, color: INK, width: nameW, align: 'left', fromTop: true, scale: 4 });
      }
      y += 16;
    });

    line(doc, y);
    y += 7;

    const totalRow = (labelAr, val, bold = false) => {
      drawArBox(doc, labelAr, MARGIN, y, TW * 0.58, {
        size: bold ? 11 : 9, bold: true, color: INK, align: 'right', fromTop: true, scale: 4,
      });
      drawEn(doc, val, MARGIN + TW * 0.58, y, {
        size: bold ? 11 : 10, bold: true, color: INK, width: TW * 0.42, align: 'right', fromTop: true, scale: 4,
      });
      y += 13;
    };

    totalRow('المجموع بدون ضريبة', fmtMoney(invoice.subtotal));
    if (parseFloat(invoice.discount_amount) > 0) {
      totalRow('الخصم', `- ${fmtMoney(invoice.discount_amount)}`);
    }
    totalRow('الضريبة', fmtMoney(invoice.tax_amount));
    totalRow('الإجمالي', fmtMoney(invoice.total), true);
    if (totalPaid > 0) totalRow('المدفوع', fmtMoney(totalPaid));
    if (methodLabel) {
      drawArBox(doc, 'طريقة الدفع', MARGIN + TW * 0.50, y, TW * 0.50, {
        size: 9, bold: true, color: INK, align: 'right', fromTop: true, scale: 4,
      });
      if (hasArabic(methodLabel)) {
        drawArBox(doc, methodLabel, MARGIN, y, TW * 0.48, {
          size: 9, bold: true, color: INK, align: 'left', fromTop: true, scale: 4,
        });
      } else {
        drawEn(doc, methodLabel, MARGIN, y, {
          size: 9, bold: true, color: INK, width: TW * 0.48, align: 'left', fromTop: true, scale: 4,
        });
      }
      y += 13;
    }
    if (balanceDue > 0.009) totalRow('المتبقي', fmtMoney(balanceDue), true);

    y += 5;
    line(doc, y);
    y += 8;

    if (qrDataUrl) {
      try {
        const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const qrSize = 72;
        doc.image(Buffer.from(b64, 'base64'), (PAGE_W - qrSize) / 2, y, { width: qrSize, height: qrSize });
        y += qrSize + 7;
      } catch { /* */ }
    }

    if (lab.vat_number) {
      drawEn(doc, `VAT: ${lab.vat_number}`, MARGIN, y, {
        size: 8, bold: true, color: INK, width: TW, align: 'center', fromTop: true, scale: 4,
      });
      y += 11;
    }
    if (lab.phone) {
      drawEn(doc, lab.phone, MARGIN, y, {
        size: 8, bold: true, color: INK, width: TW, align: 'center', fromTop: true, scale: 4,
      });
      y += 11;
    }
    if (settings.footer.note_ar) {
      drawArBox(doc, settings.footer.note_ar, MARGIN, y, TW, {
        size: 8, color: INK, align: 'center', fromTop: true, scale: 4,
      });
    } else if (settings.footer.note_en) {
      drawEn(doc, settings.footer.note_en, MARGIN, y, {
        size: 8, color: INK, width: TW, align: 'center', fromTop: true, scale: 4,
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

module.exports = {
  generateThermalInvoicePDF,
  THERMAL_PAGE_W: PAGE_W,
  paymentMethodAr,
};
