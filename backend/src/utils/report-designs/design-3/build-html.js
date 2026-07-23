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
  formatRef,
  renderResultCell,
  renderTestCell,
  getLabMeta,
  getPatientFields,
  t,
} = require('./helpers');
const {
  buildElisaMatrixRows,
  splitElisaSectionResults,
  isElisaRow,
} = require('../../elisa-report');
const {
  hasPositiveRoseBengal,
  roseBengalConfirmNote,
} = require('../../rose-bengal-note');

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

/** Title shown on top of a results box. */
const boxTitleFromRows = (rows, lang, fallback = '') => {
  const row = (rows || [])[0] || {};
  if (lang === 'ar') {
    return (row.testNameAr && String(row.testNameAr).trim())
      || (row.testNameEn && String(row.testNameEn).trim())
      || row.testCode
      || fallback;
  }
  return (row.testNameEn && String(row.testNameEn).trim())
    || (row.testNameAr && String(row.testNameAr).trim())
    || row.testCode
    || fallback;
};

const groupResultsByTestCode = (results = []) => {
  const map = new Map();
  for (const row of results || []) {
    const key = row.testCode || row.testNameEn || row.testNameAr || 'OTHER';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.values()];
};

/** Parasite / MICRO exams: one box per ordered test (blood, stool, brucella, …). */
const shouldSplitSectionByTest = (section) => {
  if (['blood_parasites', 'fecal', 'brucella'].includes(section.sectionType)) return true;
  if (section.sectionType !== 'other') return false;
  return (section.results || []).some((r) => {
    const cat = String(r.categoryCode || '').toUpperCase();
    const code = String(r.testCode || '');
    return cat === 'MICRO' || cat === 'PARAS'
      || /PARAS|BRU/i.test(code);
  });
};

const buildResultsTable = (results, lang, sectionTitle) => {
  if (!results?.length) return '';
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
  const title = sectionTitle || boxTitleFromRows(results, lang);
  const titleBlock = title
    ? `<div class="section__head section__head--box">${escapeHtml(title)}</div>`
    : '';
  const roseNote = hasPositiveRoseBengal(results)
    ? `<div class="result-note result-note--rose-bengal">${escapeHtml(roseBengalConfirmNote(lang))}</div>`
    : '';
  return `
    <section class="section section--table section--results-box card">
      ${titleBlock}
      <div class="table-wrap results-box__body">
        <table class="results-table">
          <thead><tr>${headRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      ${roseNote}
    </section>`;
};

const formatElisaRefHtml = (text) => escapeHtml(text || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join('<br />');

/** ELISA disease matrix — only when ELISA_SPECIAL_ENTRY=true. */
const buildElisaResultsTable = (results, lang, sectionTitle, sampleCode) => {
  const matrix = buildElisaMatrixRows(results, { sampleCode, lang });
  if (!matrix.length) return '';
  const title = sectionTitle || t(lang, 'ELISA Technique', 'تقنية إليزا');
  const headers = lang === 'ar'
    ? ['م', 'رقم المختبر', 'المرض المفحوص', 'التقنية', 'S/P%', 'النتيجة', 'المجال المرجعي']
    : ['S/N', 'Lab. ID', 'Investigated Disease', 'Technique', 'S/P%', 'Result', 'Reference Range'];
  const headRow = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyRows = matrix.map((row) => `
    <tr class="results-row elisa-row">
      <td class="col-sn">${escapeHtml(String(row.sn))}</td>
      <td class="col-labid">${escapeHtml(row.labId)}</td>
      <td class="col-disease"><strong>${escapeHtml(row.disease)}</strong></td>
      <td class="col-technique"><strong>${escapeHtml(row.technique)}</strong></td>
      <td class="col-sp"><strong>${escapeHtml(row.spPercent)}</strong></td>
      <td class="col-elisa-result"><strong>${escapeHtml(row.result)}</strong></td>
      <td class="col-elisa-ref">${formatElisaRefHtml(row.reference)}</td>
    </tr>`).join('');
  return `
    <section class="section section--table section--elisa card">
      <div class="section__head section__head--elisa">${escapeHtml(title)}</div>
      <div class="table-wrap elisa-box__body">
        <table class="results-table results-table--elisa">
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

const buildDynamicSections = async (sections, lang, sampleCode = '') => {
  if (!sections?.length) return '';
  const elisaSpecial = !!env.features?.elisaSpecialEntry;
  const blocks = [];
  for (const section of sections) {
    if (section.isImageSection && section.attachments?.length) {
      blocks.push(await buildImagesSection(section.attachments, lang, section.title));
    } else if (section.results?.length) {
      if (elisaSpecial && section.sectionType === 'elisa') {
        const { elisa, other } = splitElisaSectionResults(section.results);
        const elisaTitle = t(lang, 'ELISA Technique', 'تقنية إليزا');
        if (elisa.length) {
          blocks.push(buildElisaResultsTable(elisa, lang, elisaTitle, sampleCode));
        }
        if (other.length) {
          blocks.push(buildResultsTable(other, lang, elisa.length ? null : section.title));
        }
      } else if (shouldSplitSectionByTest(section)) {
        // One box per parasite / MICRO test, titled with the test name
        for (const rows of groupResultsByTestCode(section.results)) {
          const title = boxTitleFromRows(rows, lang, section.title);
          blocks.push(buildResultsTable(rows, lang, title));
        }
      } else {
        // CBC / CHEM / hormones / … — one titled box per category section
        blocks.push(buildResultsTable(section.results, lang, section.title));
      }
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
    <section class="section card section--recommendations">
      <div class="section__head section__head--recommendations">${t(lang, 'Treatment Recommendations', 'التوصيات العلاجية')}</div>
      <div class="card__body interp-card__body recommendations-body"><p>${escapeHtml(body)}</p></div>
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

/** Fixed sample-retention / client-collection liability note (all outgoing reports). */
const buildSampleRetentionNote = (lang) => {
  const note = t(
    lang,
    'Note: Al Nawader Veterinary Care Center retains samples for (7) days only from the date of issuance and delivery of results. After this period, the Center assumes no responsibility for sample storage, destruction, or disposal. The Center also assumes no responsibility for sample quality or integrity, or for any substitution, damage, contamination, or effect on result accuracy if samples were collected, drawn, or transported by the client or their representative rather than by the Al Nawader Veterinary Care Center team.',
    'ملاحظة: يحتفظ مركز رعاية النوادر البيطري بالعينات لمدة (7) أيام فقط من تاريخ إصدار وإرسال النتائج، وبعد انقضاء هذه المدة لا يتحمل المركز أي مسؤولية عن حفظ العينات أو إتلافها أو التخلص منها. كما لا يتحمل المركز أي مسؤولية عن جودة العينات أو سلامتها أو أي تبديل أو تلف أو تلوث أو تأثير على دقة النتائج إذا تم جمع العينات أو سحبها أو نقلها بواسطة العميل أو من يمثله، وليس بواسطة فريق مركز رعاية النوادر البيطري.',
  );
  return `<div class="disclaimer">${escapeHtml(note)}</div>`;
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

  // ELISA qualitative results must not feed HIGH/LOW/NORMAL overview counts
  const overviewResults = (reportData.results || []).filter((r) => !isElisaRow(r));
  const counts = buildResultCounts(overviewResults);
  const css = loadStyles();
  const dynamicSections = reportData.sections?.length
    ? await buildDynamicSections(reportData.sections, lang, reportData.sampleCode || '')
    : buildResultsTable(reportData.results || [], lang);

  const recommendationsBlock = buildTreatmentRecommendationsSection(
    reportData.treatmentRecommendations,
    lang
  );

  const mainBlock = `
    <div class="report-main">
      ${buildHeader(reportData, lab, logoDataUri, barcodeDataUri, lang)}
      ${buildPatientSection(reportData, lang)}
      ${overviewResults.length ? buildOverview(counts, lang) : ''}
      ${recommendationsBlock}
      ${dynamicSections}
    </div>`;

  const clinicalBlock = `
    <div class="clinical-page">
      ${buildSignatures(reportData, lab, qrDataUri, lang)}
      ${buildSampleRetentionNote(lang)}
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
