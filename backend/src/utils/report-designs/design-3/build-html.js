const fs = require('fs');
const path = require('path');
const env = require('../../../config/env');
const { generateQR, generateCode128 } = require('../../barcode');
const { HAS_LOGO, getBrandLogoBuffer } = require('../../pdf-logo');
const {
  buildResultCounts,
} = require('../design-2-clinical');
const {
  escapeHtml,
  formatDateTime,
  formatRef,
  renderResultCell,
  renderTestCell,
  getLabMeta,
  getPatientFields,
  resolveInstruments,
  t,
} = require('./helpers');

const ASSETS = path.join(__dirname, '../../../assets');
const FONTS = path.join(ASSETS, 'fonts');

const dataUri = (filePath, mime) => {
  if (!fs.existsSync(filePath)) return '';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
};

const loadStyles = () => {
  let css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const en = dataUri(path.join(FONTS, 'NotoSansArabic-Regular.ttf'), 'font/truetype');
  const enBold = dataUri(path.join(FONTS, 'NotoSansArabic-Bold.ttf'), 'font/truetype')
    || en;
  const ar = en;
  const arBold = enBold;
  css = css
    .replace('__FONT_EN__', en)
    .replace('__FONT_EN_BOLD__', enBold)
    .replace('__FONT_AR__', ar)
    .replace('__FONT_AR_BOLD__', arBold);
  return css;
};

const buildFooter = (lab, lang) => {
  const parts = [lab.phone, lab.email, lab.website].filter(Boolean);
  const contact = parts.join('  |  ');
  const disclaimer = t(
    lang,
    'This report was generated electronically and does not require a manual signature.',
    'هذا التقرير تم إنشاؤه إلكترونياً ولا يحتاج إلى توقيع يدوي.',
  );
  return `
    <footer class="page-footer">
      ${contact ? `<div>${escapeHtml(contact)}</div>` : ''}
      ${lab.address ? `<div>${escapeHtml(lab.address)}</div>` : ''}
      <div>${escapeHtml(disclaimer)}</div>
    </footer>`;
};

const buildHeader = (data, lab, logoDataUri, barcodeDataUri, lang) => {
  const finalBadge = data.isFinal !== false
    ? `<span class="badge badge--final">${t(lang, 'FINAL', 'نهائي')}</span>`
    : `<span class="badge badge--prelim">${t(lang, 'PRELIM', 'مبدئي')}</span>`;
  const panel = escapeHtml((data.panelName || 'Panel').slice(0, 24));
  return `
    <header class="rpt-header">
      ${logoDataUri ? `<div class="rpt-header__logo"><img src="${logoDataUri}" alt="Logo" /></div>` : '<div></div>'}
      <div class="rpt-header__brand">
        <h1 class="rpt-header__brand-title">${escapeHtml(lab.nameEn)}</h1>
        <p class="rpt-header__brand-sub">${escapeHtml(lab.nameAr)}</p>
        <p class="rpt-header__report-type">${t(lang, 'Laboratory Results Report', 'تقرير نتائج المختبر')}</p>
      </div>
      <div class="rpt-header__meta">
        <div class="meta-card">
          <span class="meta-card__label">${t(lang, 'Report', 'التقرير')}</span>
          <span class="meta-card__value">${escapeHtml(data.reportNumber || '-')}</span>
        </div>
        <div class="meta-card">
          <span class="meta-card__label">${t(lang, 'Sample', 'العينة')}</span>
          <span class="meta-card__value">${escapeHtml(data.sampleCode || '-')}</span>
        </div>
      </div>
      ${barcodeDataUri ? `<div class="rpt-header__barcode"><img src="${barcodeDataUri}" alt="Barcode" /></div>` : ''}
      <div class="rpt-header__badges">
        ${finalBadge}
        <span class="badge badge--panel">${panel}</span>
      </div>
    </header>`;
};

const buildPatientSection = (data, lang) => {
  const fields = getPatientFields(data);
  const rows = fields.map((f) => `
    <div class="patient-field">
      <span class="patient-field__label">${escapeHtml(f.label)}</span>
      <span class="patient-field__value">${escapeHtml(f.val)}</span>
    </div>`).join('');
  return `
    <section class="section card">
      <div class="section__head">${t(lang, 'Patient Information', 'بيانات المريض')}</div>
      <div class="card__body patient-grid">${rows}</div>
    </section>`;
};

const buildOverview = (counts, lang) => {
  const title = t(lang, 'Result Overview', 'ملخص النتائج');
  const highLbl = t(lang, 'HIGH', 'مرتفع');
  const lowLbl = t(lang, 'LOW', 'منخفض');
  const normLbl = t(lang, 'NORMAL', 'طبيعي');
  return `
    <section class="overview">
      <div class="overview__title">${escapeHtml(title)}</div>
      <div class="overview__stats">
        <span class="stat-pill stat-pill--high">${escapeHtml(highLbl)}: ${counts.high}</span>
        <span class="stat-pill stat-pill--low">${escapeHtml(lowLbl)}: ${counts.low}</span>
        <span class="stat-pill stat-pill--normal">${escapeHtml(normLbl)}: ${counts.normal}</span>
      </div>
    </section>`;
};

const buildResultsTable = (results, lang, sectionTitle) => {
  const headers = lang === 'ar'
    ? ['اسم الفحص', 'النتيجة', 'الوحدة', 'المجال المرجعي']
    : ['Test', 'Result', 'Unit', 'Reference Range'];
  const headRow = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyRows = (results || []).map((row) => `
    <tr class="results-row">
      <td class="col-test">${renderTestCell(row, lang)}</td>
      <td class="col-result">${renderResultCell(row)}</td>
      <td class="col-unit">${escapeHtml(row.unit || '-')}</td>
      <td class="col-ref"><span class="ref-badge">${escapeHtml(formatRef(row, lang))}</span></td>
    </tr>`).join('');
  const titleBlock = sectionTitle
    ? `<div class="section__head section__head--panel">${escapeHtml(sectionTitle)}</div>`
    : '';
  return `
    <section class="section section--table">
      ${titleBlock}
      <div class="table-wrap">
        <table class="results-table">
          <thead><tr>${headRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </section>`;
};

const buildImagesSection = async (attachments, lang, sectionTitle) => {
  if (!attachments?.length) return '';
  const { readImageBuffer } = require('../../../config/storage');
  const imgs = await Promise.all(attachments.map(async (att) => {
    const buffer = await readImageBuffer(att.file_url);
    if (!buffer?.length) return '';
    const src = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    const cap = att.caption ? `<figcaption>${escapeHtml(att.caption)}</figcaption>` : '';
    return `<figure class="report-image"><img src="${src}" alt="" />${cap}</figure>`;
  }));
  const grid = imgs.filter(Boolean).join('');
  if (!grid) return '';
  return `
    <section class="section card section--images">
      <div class="section__head">${escapeHtml(sectionTitle || t(lang, 'Microscopy Images', 'صور الميكروسكوب'))}</div>
      <div class="image-grid">${grid}</div>
    </section>`;
};

const buildDynamicSections = async (sections, lang) => {
  if (!sections?.length) return '';
  const blocks = [];
  for (const section of sections) {
    if (section.isImageSection && section.attachments?.length) {
      blocks.push(await buildImagesSection(section.attachments, lang, section.title));
    } else if (section.results?.length) {
      blocks.push(buildResultsTable(section.results, lang, section.title));
    }
  }
  return blocks.join('');
};

const buildClinicalSummarySection = (items, lang) => {
  if (!items.length) return '';
  const listClass = items.length > 4 ? 'summary-list' : 'summary-list summary-list--single';
  const lis = items.map((item) => {
    const iconCls = item.icon === 'high' ? 'high' : item.icon === 'low' ? 'low' : 'neutral';
    return `<li class="summary-item"><span class="summary-item__icon summary-item__icon--${iconCls}"></span><span>${escapeHtml(item.text)}</span></li>`;
  }).join('');
  return `
    <section class="section card">
      <div class="section__head">${t(lang, 'Clinical Summary', 'ملخص سريري')}</div>
      <ul class="${listClass}">${lis}</ul>
    </section>`;
};

const buildTreatmentRecommendationsSection = (text, lang) => {
  const body = String(text || '').trim();
  if (!body) return '';
  return `
    <section class="section card">
      <div class="section__head">${t(lang, 'Treatment Recommendations', 'التوصيات العلاجية')}</div>
      <div class="card__body interp-card__body"><p>${escapeHtml(body)}</p></div>
    </section>`;
};

const buildSignatures = (data, lab, qrDataUri, lang) => {
  const labName = data.labApproval?.approved ? (data.labApproval.name || '-') : '________________';
  const vetName = data.vetApproval?.approved ? (data.vetApproval.name || '-') : '________________';
  const labLic = escapeHtml(data.labApproval?.license || lab.license || '-');
  const vetLic = escapeHtml(data.vetApproval?.license || '-');
  return `
    <section class="sig-grid">
      <div class="sig-block">
        <div class="sig-block__title">${t(lang, 'Laboratory Specialist', 'أخصائي المختبر')}</div>
        <div class="sig-block__role">${t(lang, 'Lic.', 'رخصة')} ${labLic}</div>
        <div class="sig-block__name">${escapeHtml(labName)}</div>
        <div class="sig-block__esign">E-Signed</div>
      </div>
      <div class="sig-verify">
        ${qrDataUri ? `<div class="sig-verify__qr"><img src="${qrDataUri}" alt="QR" /></div>` : ''}
        <div class="sig-verify__seal">RARE VET<br />VERIFIED<br />معتمد</div>
        <div class="sig-verify__label">${t(lang, 'Verify Report', 'تحقق من التقرير')}</div>
      </div>
      <div class="sig-block">
        <div class="sig-block__title">${t(lang, 'Veterinarian', 'الطبيب البيطري')}</div>
        <div class="sig-block__role">${t(lang, 'Lic.', 'رخصة')} ${vetLic}</div>
        <div class="sig-block__name">${escapeHtml(vetName)}</div>
        <div class="sig-block__esign">E-Signed</div>
      </div>
    </section>`;
};

const buildIssueBar = (data, lang) => {
  const issued = formatDateTime(data.issuedDate || data.date);
  const instrument = data.instrument || resolveInstruments(data.results);
  return `
    <section class="issue-bar">
      <div><strong>${t(lang, 'Issued', 'تاريخ الإصدار')}:</strong> ${escapeHtml(issued)}</div>
      <div><strong>${t(lang, 'Instrument', 'الجهاز')}:</strong> ${escapeHtml(instrument)}</div>
    </section>`;
};

const buildReportHtml = async (reportData) => {
  const lang = reportData.language || 'ar';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const lab = getLabMeta();

  let logoDataUri = '';
  if (HAS_LOGO) {
    const buf = await getBrandLogoBuffer('#4E342E');
    if (buf) logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  }

  let barcodeDataUri = '';
  const bcText = reportData.barcode || reportData.sampleCode;
  if (bcText) {
    try { barcodeDataUri = await generateCode128(bcText); } catch { /* */ }
  }

  let qrDataUri = '';
  try {
    qrDataUri = await generateQR({
      reportNumber: reportData.reportNumber,
      sampleCode: reportData.sampleCode,
      verificationCode: reportData.verificationCode,
    });
  } catch { /* */ }

  const counts = buildResultCounts(reportData.results || []);
  const css = loadStyles();
  const dynamicSections = reportData.sections?.length
    ? await buildDynamicSections(reportData.sections, lang)
    : buildResultsTable(reportData.results || [], lang);

  const mainBlock = `
    <div class="report-main">
      ${buildHeader(reportData, lab, logoDataUri, barcodeDataUri, lang)}
      ${buildPatientSection(reportData, lang)}
      ${buildOverview(counts, lang)}
      ${dynamicSections}
    </div>`;

  const clinicalBlock = `
    <div class="clinical-page">
      ${buildTreatmentRecommendationsSection(reportData.treatmentRecommendations, lang)}
      ${buildSignatures(reportData, lab, qrDataUri, lang)}
      ${buildIssueBar(reportData, lang)}
    </div>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(reportData.reportNumber || 'Report')}</title>
  <style>${css}</style>
</head>
<body dir="${dir}">
  <div class="report">
    ${mainBlock}
    ${clinicalBlock}
    ${buildFooter(lab, lang)}
  </div>
</body>
</html>`;
};

module.exports = { buildReportHtml, loadStyles };
