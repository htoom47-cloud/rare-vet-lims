/** Print one brucella herd list. Does not create per-sample reports. */

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function printBrucellaList({ customerName, rows, labels }) {
  const body = rows.length
    ? rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.sample_code)}</td>
        <td>${escapeHtml(row.animal_code)}</td>
        <td>${escapeHtml(row.animal_name || '')}</td>
        <td>${escapeHtml(row.result_value)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5">${escapeHtml(labels.empty)}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; margin: 0; padding: 12px; font-size: 12px; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #6b7280; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: start; }
    th { background: #f9fafb; }
    .note { margin-top: 14px; font-size: 11px; color: #4b5563; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(labels.title)}</h1>
  <div class="meta">${escapeHtml(labels.customer)}: ${escapeHtml(customerName)} — ${escapeHtml(labels.count)}: ${rows.length}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>${escapeHtml(labels.sample)}</th>
        <th>${escapeHtml(labels.animal)}</th>
        <th>${escapeHtml(labels.animalName)}</th>
        <th>${escapeHtml(labels.result)}</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <p class="note">${escapeHtml(labels.note)}</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`;

  const win = window.open('about:blank', '_blank', 'width=900,height=1000');
  if (!win) {
    const err = new Error('Popup blocked');
    err.code = 'POPUP_BLOCKED';
    throw err;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
