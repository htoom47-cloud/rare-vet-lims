/** Open a printable A4 monthly sales report in a new window (read-only UI). */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const money = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

const tableHtml = (headers, rows, empty) => {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
};

const summaryHtml = (items) => `
  <div class="summary">
    ${items.map(([label, value]) => `
      <div class="card">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value)}</div>
      </div>`).join('')}
  </div>`;

function openPrintHtml(html) {
  // Match thermal invoice print: never use noopener (it yields a blank window).
  const win = window.open('about:blank', '_blank', 'width=900,height=1000');
  if (!win) {
    const err = new Error('Popup blocked');
    err.code = 'POPUP_BLOCKED';
    throw err;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  try { win.focus(); } catch { /* ignore */ }
}

export function printOpsSalesReport({
  from,
  to,
  sales,
  labels,
  isArabic = true,
}) {
  if (!sales) throw new Error('No sales data');

  const dir = isArabic ? 'rtl' : 'ltr';
  const lang = isArabic ? 'ar' : 'en';
  const methodRows = (sales.by_method || []).map((row) => [
    labels.methodLabel(row.method),
    money(row.total),
  ]);
  const serviceRows = (sales.by_service || []).map((row) => [
    labels.serviceTypeLabel(row.type),
    labels.serviceLabel(row),
    row.quantity,
    money(row.revenue),
    row.line_count,
  ]);
  const customerRows = (sales.by_customer || []).map((row) => [
    row.full_name || '—',
    row.invoice_count,
    money(row.invoiced),
    money(row.collected),
  ]);

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      color: #1f2937;
      margin: 0;
      padding: 12px;
      font-size: 12px;
      background: #fff;
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 18px 0 8px; }
    .meta { color: #6b7280; margin-bottom: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 8px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .label { color: #6b7280; font-size: 11px; margin-bottom: 4px; }
    .value { font-weight: 700; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: start; }
    th { background: #f9fafb; font-weight: 600; }
    .footer { margin-top: 16px; color: #9ca3af; font-size: 10px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(labels.title)}</h1>
  <div class="meta">${escapeHtml(labels.range)}: ${escapeHtml(from)} — ${escapeHtml(to)}</div>
  ${summaryHtml([
    [labels.invoices, sales.invoice_count],
    [labels.invoiced, money(sales.invoiced_total)],
    [labels.collected, money(sales.collections_total)],
    [labels.discount, money(sales.discount_total)],
    [labels.tax, money(sales.tax_total)],
    [labels.cancelled, sales.cancelled_count],
  ])}
  <h2>${escapeHtml(labels.byMethod)}</h2>
  ${tableHtml([labels.paymentMethod, labels.collected], methodRows, labels.noData)}
  <h2>${escapeHtml(labels.byService)}</h2>
  ${tableHtml(
    [labels.serviceType, labels.service, labels.quantity, labels.revenue, labels.lineCount],
    serviceRows,
    labels.noData,
  )}
  <h2>${escapeHtml(labels.byCustomer)}</h2>
  ${tableHtml(
    [labels.customer, labels.invoiceCount, labels.invoiced, labels.collected],
    customerRows,
    labels.noData,
  )}
  <div class="footer">${escapeHtml(labels.footer)}</div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`;

  openPrintHtml(html);
}
