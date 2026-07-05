/**
 * Browser print — 80mm thermal receipt layout (HTML/CSS, not ESC/POS).
 */
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const lineRow = (label, value, bold = false) => (
  `<tr><td>${escapeHtml(label)}</td><td class="${bold ? 'bold' : ''}">${escapeHtml(value)}</td></tr>`
);

export function buildThermalInvoiceHtml(invoice, lab, { isArabic = true } = {}) {
  const dir = isArabic ? 'rtl' : 'ltr';
  const lang = isArabic ? 'ar' : 'en';
  const items = invoice.items || invoice.invoice_items || [];
  const itemRows = items.map((item) => (
    `<tr>
      <td>${escapeHtml(item.description || item.test_name || item.service_name || '-')}</td>
      <td>${Number(item.quantity || 1)}</td>
      <td>${Number(item.unit_price || item.price || 0).toFixed(2)}</td>
      <td>${Number(item.total_price || item.total || 0).toFixed(2)}</td>
    </tr>`
  )).join('');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.invoice_number || 'Invoice')}</title>
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
    hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 2px 0; vertical-align: top; }
    .items th { border-bottom: 1px solid #333; font-size: 10px; }
    .items td { font-size: 10px; }
    .totals td:last-child { text-align: ${isArabic ? 'left' : 'right'}; white-space: nowrap; }
    .meta td:first-child { opacity: 0.75; width: 38%; }
  </style>
</head>
<body>
  <div class="center lab">${escapeHtml(isArabic ? lab.nameAr : lab.name)}</div>
  <div class="center">${escapeHtml(lab.phone || '')}</div>
  <div class="center">${escapeHtml(isArabic ? 'فاتورة' : 'Invoice')}</div>
  <hr />
  <table class="meta">
    ${lineRow(isArabic ? 'رقم الفاتورة' : 'Invoice #', invoice.invoice_number, true)}
    ${lineRow(isArabic ? 'التاريخ' : 'Date', invoice.created_at ? new Date(invoice.created_at).toLocaleString(isArabic ? 'ar-SA' : 'en-GB') : '-')}
    ${lineRow(isArabic ? 'العميل' : 'Customer', invoice.customer_name || invoice.customer_name_ar || '-')}
    ${invoice.vat_number || lab.vatNumber ? lineRow(isArabic ? 'الرقم الضريبي' : 'VAT', invoice.vat_number || lab.vatNumber) : ''}
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
    ${lineRow(isArabic ? 'المجموع' : 'Subtotal', `${Number(invoice.subtotal || 0).toFixed(2)} SAR`)}
    ${lineRow(isArabic ? 'الضريبة' : 'VAT', `${Number(invoice.tax_amount || 0).toFixed(2)} SAR`)}
    ${lineRow(isArabic ? 'الإجمالي' : 'Total', `${Number(invoice.total || 0).toFixed(2)} SAR`, true)}
  </table>
  <hr />
  <div class="center">${escapeHtml(isArabic ? 'شكراً لتعاملكم معنا' : 'Thank you')}</div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;
}

export async function printThermalInvoice(invoice, lab, options = {}) {
  const html = buildThermalInvoiceHtml(invoice, lab, options);
  const w = window.open('', '_blank', 'width=360,height=720');
  if (!w) throw new Error('POPUP_BLOCKED');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export default printThermalInvoice;
