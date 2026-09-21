/**
 * Browser print — 80mm thermal simplified tax invoice (HTML/CSS, not ESC/POS).
 */
import { aggregateThermalInvoiceItems } from './thermalInvoiceItems';
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (value) => Number(value || 0).toFixed(2);

const lineRow = (label, value, bold = false) => (
  `<tr><td>${escapeHtml(label)}</td><td class="${bold ? 'bold' : ''}">${escapeHtml(value)}</td></tr>`
);

const PAYMENT_METHOD_AR = {
  cash: 'نقدي',
  card: 'شبكة',
  bank_transfer: 'تحويل بنكي',
  credit: 'آجل',
};
const PAYMENT_METHOD_EN = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  credit: 'On account',
};
const STATUS_AR = {
  draft: 'مسودة',
  issued: 'صادرة',
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئياً',
  cancelled: 'ملغاة',
  refunded: 'مستردة',
};
const STATUS_EN = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  partial: 'Partial',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const paymentMethodLabelOf = (method, isArabic) => {
  const key = String(method || '').trim().toLowerCase().replace(/\s+/g, '_');
  const map = isArabic ? PAYMENT_METHOD_AR : PAYMENT_METHOD_EN;
  return map[key] || String(method || '').trim();
};

const statusLabelOf = (status, isArabic) => {
  const key = String(status || '').trim().toLowerCase();
  const map = isArabic ? STATUS_AR : STATUS_EN;
  return map[key] || String(status || '').trim();
};

const DEFAULT_LAB = {
  name: 'AL NAWADER VETERINARY CARE CENTER',
  nameAr: 'مركز رعاية النوادر البيطري',
  phone: '0115007257',
  vatNumber: '311042487300003',
  address: '',
};

/** Map invoice-settings API payload → thermal lab block. */
export function labFromInvoiceSettings(settings) {
  const lab = settings?.lab || settings?.data?.lab || settings || {};
  return {
    name: lab.name || lab.name_en || DEFAULT_LAB.name,
    nameAr: lab.name_ar || lab.nameAr || DEFAULT_LAB.nameAr,
    phone: lab.phone || DEFAULT_LAB.phone,
    vatNumber: lab.vat_number || lab.vatNumber || DEFAULT_LAB.vatNumber,
    address: lab.address || lab.address_ar || '',
  };
}

export function buildThermalInvoiceHtml(invoice, labInput, {
  isArabic = true,
  paymentMethodLabel = '',
  qrDataUrl = '',
} = {}) {
  const lab = { ...DEFAULT_LAB, ...(labInput || {}) };
  const dir = isArabic ? 'rtl' : 'ltr';
  const lang = isArabic ? 'ar' : 'en';
  const locale = isArabic ? 'ar-SA' : 'en-GB';
  const items = aggregateThermalInvoiceItems(invoice.items || invoice.invoice_items || []);
  const customerName = isArabic
    ? (invoice.customer_name_ar || invoice.customer_name || '-')
    : (invoice.customer_name || invoice.customer_name_ar || '-');
  const vatNo = invoice.vat_number || lab.vatNumber || '';
  const paid = Number(invoice.total_paid || 0);
  const balance = Number(
    invoice.balance_due != null
      ? invoice.balance_due
      : Math.max(Number(invoice.total || 0) - paid, 0)
  );
  const discount = Number(invoice.discount_amount || 0)
    + Number(invoice.field_visit_discount_amount || 0);
  const lastPayment = (invoice.payments || []).slice(-1)[0];
  const methodLabel = paymentMethodLabel
    || paymentMethodLabelOf(lastPayment?.method || invoice.payment_method, isArabic);
  const statusLabel = statusLabelOf(invoice.status, isArabic);

  const itemRows = items.map((item) => (
    `<tr>
      <td>${escapeHtml(item.description || item.test_name || item.service_name || '-')}</td>
      <td class="qty">${Number(item.quantity || 1)}</td>
      <td class="price">${money(item.total_price || item.total || 0)}</td>
    </tr>`
  )).join('');

  const title = isArabic ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice';
  const when = invoice.created_at
    ? new Date(invoice.created_at).toLocaleString(locale)
    : '-';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.invoice_number || title)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "IBM Plex Sans Arabic", Cairo, Tahoma, Arial, sans-serif;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      width: 72mm;
      margin: 0 auto;
      color: #000;
      -webkit-font-smoothing: none;
    }
    .center { text-align: center; }
    .bold { font-weight: 800; }
    .lab { font-size: 16px; font-weight: 800; margin-bottom: 3px; }
    .title { font-size: 14px; font-weight: 800; margin-top: 6px; }
    .muted { font-size: 12px; }
    hr { border: none; border-top: 2px solid #000; margin: 7px 0; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 3px 0; vertical-align: top; color: #000; }
    .items th { border-bottom: 2px solid #000; font-size: 12px; }
    .items td { font-size: 13px; word-break: break-word; }
    .items .qty, .items th.qty {
      width: 12mm;
      text-align: center;
      unicode-bidi: isolate;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .items .price, .items th.price {
      width: 18mm;
      text-align: ${isArabic ? 'left' : 'right'};
      unicode-bidi: isolate;
      white-space: nowrap;
    }
    .totals td:last-child { text-align: ${isArabic ? 'left' : 'right'}; white-space: nowrap; unicode-bidi: isolate; }
    .meta td:first-child { width: 42%; }
    .qr { display: block; margin: 8px auto 4px; width: 120px; height: 120px; }
  </style>
</head>
<body>
  <div class="center lab">${escapeHtml(isArabic ? lab.nameAr : lab.name)}</div>
  ${lab.address ? `<div class="center muted">${escapeHtml(lab.address)}</div>` : ''}
  <div class="center muted">${escapeHtml(lab.phone || '')}</div>
  <div class="center title">${escapeHtml(title)}</div>
  <hr />
  <table class="meta">
    ${lineRow(isArabic ? 'رقم الفاتورة' : 'Invoice #', invoice.invoice_number, true)}
    ${lineRow(isArabic ? 'التاريخ' : 'Date', when)}
    ${lineRow(isArabic ? 'الحالة' : 'Status', statusLabel, true)}
    ${lineRow(isArabic ? 'العميل' : 'Customer', customerName)}
    ${vatNo ? lineRow(isArabic ? 'الرقم الضريبي' : 'VAT No.', vatNo) : ''}
  </table>
  <hr />
  <table class="items">
    <thead>
      <tr>
        <th>${isArabic ? 'الصنف' : 'Item'}</th>
        <th class="qty">${isArabic ? 'العدد' : 'Qty'}</th>
        <th class="price">${isArabic ? 'ريال' : 'SAR'}</th>
      </tr>
    </thead>
    <tbody>${itemRows || `<tr><td colspan="3">-</td></tr>`}</tbody>
  </table>
  <hr />
  <table class="totals">
    ${lineRow(isArabic ? 'المجموع بدون ضريبة' : 'Subtotal excl. VAT', money(invoice.subtotal))}
    ${discount > 0.009 ? lineRow(isArabic ? 'الخصم' : 'Discount', `-${money(discount)}`) : ''}
    ${lineRow(isArabic ? 'الضريبة' : 'VAT', money(invoice.tax_amount))}
    ${lineRow(isArabic ? 'الإجمالي' : 'Total incl. VAT', money(invoice.total), true)}
    ${paid > 0.009 ? lineRow(isArabic ? 'المدفوع' : 'Paid', money(paid)) : ''}
    ${methodLabel ? lineRow(isArabic ? 'طريقة الدفع' : 'Payment method', methodLabel) : ''}
    ${balance > 0.009 ? lineRow(isArabic ? 'المتبقي' : 'Balance due', money(balance), true) : ''}
  </table>
  ${qrDataUrl ? `<hr /><img class="qr" src="${qrDataUrl}" alt="ZATCA QR" />` : ''}
  <hr />
  <div class="center">${escapeHtml(isArabic ? 'شكراً لتعاملكم معنا' : 'Thank you')}</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`;
}

async function buildVatQrDataUrl(vatQrData) {
  if (!vatQrData || typeof document === 'undefined') return '';
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(String(vatQrData), {
      width: 180,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch {
    // Optional dependency — receipt still prints without QR
    return '';
  }
}

export async function printThermalInvoice(invoice, lab, options = {}) {
  const qrDataUrl = options.qrDataUrl
    || (await buildVatQrDataUrl(invoice?.vat_qr_data));
  const html = buildThermalInvoiceHtml(invoice, lab, { ...options, qrDataUrl });
  const w = window.open('', '_blank', 'width=360,height=720');
  if (!w) throw new Error('POPUP_BLOCKED');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export default printThermalInvoice;
