/**
 * Browser print — 80mm thermal simplified tax invoice (HTML/CSS, not ESC/POS).
 */
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (value) => `${Number(value || 0).toFixed(2)} SAR`;

const lineRow = (label, value, bold = false) => (
  `<tr><td>${escapeHtml(label)}</td><td class="${bold ? 'bold' : ''}">${escapeHtml(value)}</td></tr>`
);

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
  const items = invoice.items || invoice.invoice_items || [];
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

  const itemRows = items.map((item) => (
    `<tr>
      <td>${escapeHtml(item.description || item.test_name || item.service_name || '-')}</td>
      <td>${Number(item.quantity || 1)}</td>
      <td>${Number(item.unit_price || item.price || 0).toFixed(2)}</td>
      <td>${Number(item.total_price || item.total || 0).toFixed(2)}</td>
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
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      width: 76mm;
      margin: 0 auto;
      color: #111;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .lab { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
    .title { font-size: 12px; font-weight: 700; margin-top: 4px; }
    .muted { font-size: 10px; opacity: 0.85; }
    hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 2px 0; vertical-align: top; }
    .items th { border-bottom: 1px solid #333; font-size: 10px; }
    .items td { font-size: 10px; word-break: break-word; }
    .items th:nth-child(2), .items td:nth-child(2),
    .items th:nth-child(3), .items td:nth-child(3),
    .items th:nth-child(4), .items td:nth-child(4) { text-align: ${isArabic ? 'left' : 'right'}; white-space: nowrap; }
    .totals td:last-child { text-align: ${isArabic ? 'left' : 'right'}; white-space: nowrap; }
    .meta td:first-child { opacity: 0.75; width: 42%; }
    .qr { display: block; margin: 8px auto 4px; width: 110px; height: 110px; }
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
    ${lineRow(isArabic ? 'العميل' : 'Customer', customerName)}
    ${vatNo ? lineRow(isArabic ? 'الرقم الضريبي' : 'VAT No.', vatNo) : ''}
  </table>
  <hr />
  <table class="items">
    <thead>
      <tr>
        <th>${isArabic ? 'البند' : 'Item'}</th>
        <th>${isArabic ? 'كم' : 'Qty'}</th>
        <th>${isArabic ? 'سعر' : 'Price'}</th>
        <th>${isArabic ? 'الإجمالي' : 'Total'}</th>
      </tr>
    </thead>
    <tbody>${itemRows || `<tr><td colspan="4">-</td></tr>`}</tbody>
  </table>
  <hr />
  <table class="totals">
    ${lineRow(isArabic ? 'المجموع (بدون ضريبة)' : 'Subtotal excl. VAT', money(invoice.subtotal))}
    ${discount > 0.009 ? lineRow(isArabic ? 'الخصم' : 'Discount', `-${money(discount)}`) : ''}
    ${lineRow(isArabic ? 'ضريبة القيمة المضافة' : 'VAT', money(invoice.tax_amount))}
    ${lineRow(isArabic ? 'الإجمالي شامل الضريبة' : 'Total incl. VAT', money(invoice.total), true)}
    ${paid > 0.009 ? lineRow(isArabic ? 'المدفوع' : 'Paid', money(paid)) : ''}
    ${paymentMethodLabel ? lineRow(isArabic ? 'طريقة الدفع' : 'Payment method', paymentMethodLabel) : ''}
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
    return await QRCode.toDataURL(String(vatQrData), { width: 160, margin: 1 });
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
