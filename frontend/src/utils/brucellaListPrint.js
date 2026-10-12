/** Print one official brucella herd list in the lab report style. Does not create per-sample reports. */

const LAB = {
  nameAr: 'مركز رعاية النوادر البيطري',
  nameEn: 'AL NAWADER VETERINARY CARE CENTER',
  phone: '0115007257',
  website: 'https://lims.rarevetcare.com',
};

const NOTE_AR = 'ملاحظة: النتيجة المالطية الإيجابية يجب التأكيد باختبار ELISA.';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const isPositive = (value) => /^(positive|إيجابي|\+|pos)$/i.test(String(value || '').trim());

export function printBrucellaList({ customerName, rows, labels }) {
  const printedAt = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const positiveCount = rows.filter((row) => isPositive(row.result_value)).length;
  const otherCount = rows.length - positiveCount;
  const logo = `${window.location.origin}/logo.png`;
  const body = rows.length
    ? rows.map((row, index) => {
      const positive = isPositive(row.result_value);
      return `
      <tr class="results-row">
        <td class="col-num">${index + 1}</td>
        <td>${escapeHtml(row.sample_code)}</td>
        <td>${escapeHtml(row.animal_code)}</td>
        <td class="col-name">${escapeHtml(row.animal_name || '—')}</td>
        <td class="col-result${positive ? ' status-high' : ''}">${escapeHtml(row.result_value)}</td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="5">${escapeHtml(labels.empty)}</td></tr>`;
  const note = positiveCount
    ? `<div class="result-note result-note--rose-bengal">${escapeHtml(labels.note || NOTE_AR)}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.title)}</title>
  <style>
    :root {
      --color-navy: #4E342E;
      --color-navy-light: #6B5348;
      --color-brand: #4E342E;
      --color-accent: #8B6B3E;
      --color-ink: #1a1a1a;
      --color-muted: #75685C;
      --color-border: #D8C8AE;
      --color-border-strong: #B8A992;
      --color-surface: #ffffff;
      --color-surface-alt: #F8F5F0;
      --color-high: #b91c1c;
      --color-normal: #15803d;
    }
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: var(--color-ink);
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      font-size: 13px; line-height: 1.45;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .report { width: 100%; max-width: 186mm; margin: 0 auto; }
    .report > * + * { margin-top: 8px; }
    .rpt-header {
      display: grid; grid-template-columns: auto 1fr auto; gap: 8px 16px; align-items: center;
      padding: 8px 16px;
      background: linear-gradient(135deg, var(--color-surface-alt) 0%, #fff 100%);
      border: 1px solid var(--color-border); border-radius: 8px; border-top: 3px solid var(--color-accent);
    }
    .rpt-header__logo img { display: block; width: 52px; height: 52px; object-fit: contain; }
    .rpt-header__brand-title, .rpt-header__brand-sub {
      margin: 0; font-size: 18px; font-weight: 700; color: var(--color-brand); line-height: 1.25;
    }
    .rpt-header__report-type { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: var(--color-navy); }
    .rpt-header__meta { display: grid; gap: 8px; }
    .meta-card { padding: 8px; background: #fff; border: 1px solid var(--color-border); border-radius: 4px; }
    .meta-card__label { display: block; font-size: 10px; color: var(--color-muted); letter-spacing: 0.04em; }
    .meta-card__value { display: block; margin-top: 2px; font-size: 13px; font-weight: 700; color: var(--color-brand); }
    .rpt-header__badges { grid-column: 1 / -1; display: flex; }
    .badge {
      display: inline-flex; align-items: center; padding: 4px 10px; font-size: 10px; font-weight: 700;
      border-radius: 999px; background: var(--color-navy); color: #fff;
    }
    .card { border: 1px solid var(--color-border); border-radius: 8px; background: #fff; }
    .card__body { padding: 8px 16px; }
    .patient-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 12px; }
    .patient-field { display: grid; grid-template-columns: 72px 1fr; gap: 4px; align-items: baseline; }
    .patient-field__label { font-size: 11px; color: var(--color-muted); }
    .patient-field__value { font-size: 13px; font-weight: 600; }
    .overview {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      padding: 8px 16px; background: var(--color-surface-alt);
      border: 1px solid var(--color-border); border-radius: 8px;
    }
    .overview__title { font-weight: 700; color: var(--color-navy); }
    .overview__stats { display: flex; gap: 8px; }
    .stat-pill { padding: 4px 12px; font-size: 12px; font-weight: 700; border-radius: 4px; border: 1px solid transparent; }
    .stat-pill--high { background: #fef2f2; color: var(--color-high); border-color: #fecaca; }
    .stat-pill--normal { background: #f0fdf4; color: var(--color-normal); border-color: #bbf7d0; }
    .section--results-box { border: 1px solid var(--color-border); border-radius: 8px; overflow: visible; }
    .section__head {
      padding: 8px 12px; background: var(--color-navy); color: #fff;
      font-weight: 700; text-align: center;
    }
    .results-table { width: 100%; border-collapse: collapse; }
    .results-table thead { display: table-header-group; }
    .results-table thead th {
      padding: 6px 8px; background: var(--color-navy); color: #fff; font-size: 12px; font-weight: 700;
      text-align: center; border: 1px solid var(--color-navy-light);
    }
    .results-table tbody td {
      padding: 4px 6px; font-size: 12px; border: 1px solid var(--color-border); text-align: center; vertical-align: middle;
    }
    .results-table tbody tr:nth-child(even) td { background: var(--color-surface-alt); }
    .results-table .col-name { text-align: start; }
    .results-table .status-high { color: var(--color-high); font-weight: 700; }
    .result-note {
      margin: 8px; padding: 6px 8px; border: 1px solid #c9a86a; border-radius: 4px;
      background: #faf6ef; font-size: 12px;
    }
    .page-footer {
      margin-top: 10px; padding-top: 6px; border-top: 1px solid var(--color-border);
      font-size: 10px; color: var(--color-muted); text-align: center; line-height: 1.5;
    }
    @media print {
      .rpt-header, .patient-card, .overview { break-inside: avoid; page-break-inside: avoid; height: auto; }
      .section--results-box { break-inside: auto; page-break-inside: auto; overflow: visible; }
      .results-table { page-break-inside: auto; }
      .results-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report">
    <header class="rpt-header">
      <div class="rpt-header__logo"><img src="${escapeHtml(logo)}" alt="" /></div>
      <div class="rpt-header__brand">
        <h1 class="rpt-header__brand-title">${escapeHtml(LAB.nameAr)}</h1>
        <p class="rpt-header__brand-sub">${escapeHtml(LAB.nameEn)}</p>
        <p class="rpt-header__report-type">${escapeHtml(labels.reportType || 'تقرير نتائج المختبر')}</p>
      </div>
      <div class="rpt-header__meta">
        <div class="meta-card">
          <span class="meta-card__label">${escapeHtml(labels.date || 'التاريخ')}</span>
          <span class="meta-card__value">${escapeHtml(printedAt)}</span>
        </div>
        <div class="meta-card">
          <span class="meta-card__label">${escapeHtml(labels.count)}</span>
          <span class="meta-card__value">${rows.length}</span>
        </div>
      </div>
      <div class="rpt-header__badges">
        <span class="badge">${escapeHtml(labels.examName || 'المالطية روز بنغال')}</span>
      </div>
    </header>
    <section class="card patient-card">
      <div class="card__body patient-grid">
        <div class="patient-field">
          <span class="patient-field__label">${escapeHtml(labels.customer)}</span>
          <span class="patient-field__value">${escapeHtml(customerName || '—')}</span>
        </div>
        <div class="patient-field">
          <span class="patient-field__label">${escapeHtml(labels.exam || 'الفحص')}</span>
          <span class="patient-field__value">${escapeHtml(labels.examName || 'المالطية روز بنغال')}</span>
        </div>
        <div class="patient-field">
          <span class="patient-field__label">${escapeHtml(labels.date || 'التاريخ')}</span>
          <span class="patient-field__value">${escapeHtml(printedAt)}</span>
        </div>
      </div>
    </section>
    <section class="overview">
      <div class="overview__title">${escapeHtml(labels.summary || 'ملخص النتائج')}</div>
      <div class="overview__stats">
        <span class="stat-pill stat-pill--high">${escapeHtml(labels.positive)}: ${positiveCount}</span>
        <span class="stat-pill stat-pill--normal">${escapeHtml(labels.negative)}: ${otherCount}</span>
      </div>
    </section>
    <section class="section section--results-box card">
      <div class="section__head">${escapeHtml(labels.examName || 'المالطية روز بنغال')}</div>
      <table class="results-table">
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
      ${note}
    </section>
    <footer class="page-footer">
      <div>${escapeHtml(LAB.phone)}  |  ${escapeHtml(LAB.website)}</div>
      <div>${escapeHtml(labels.disclaimer || 'هذا التقرير تم إنشاؤه إلكترونياً ولا يحتاج إلى توقيع يدوي.')}</div>
    </footer>
  </div>
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
