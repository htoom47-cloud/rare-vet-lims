const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const truncate = (text, max) => {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
};

const LABEL_PRINT_STYLES = `
  @page { size: 50mm 25mm; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    background: #fff;
  }
  .label-50x25 {
    width: 50mm; height: 25mm; box-sizing: border-box;
    padding: 2mm 1.5mm 1.5mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: Arial, Helvetica, sans-serif; color: #000;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .label-50x25 svg { max-width: 100%; height: auto; display: block; }
  .label-50x25-line {
    margin: 0.2mm 0 0; padding: 0; font-size: 8pt; line-height: 1.12;
    text-align: center; max-width: 100%; overflow: hidden;
    white-space: nowrap; text-overflow: ellipsis;
  }
  .label-50x25 svg text { font-size: 10pt !important; font-weight: 600; }
  .label-50x25-tests { font-weight: 600; }
  .label-50x25-error { font-size: 7pt; color: #c00; text-align: center; }
`;

export const labelMetaFromSample = (sample, isArabic = false) => {
  const barcode = String(sample?.barcode || sample?.sample_code || '').trim();
  const testLine = (sample?.tests || [])
    .map((t) => (isArabic ? t.test_name_ar : t.test_name) || t.test_name || t.test_code)
    .filter(Boolean)
    .join(' · ');
  const animalLine = [sample?.animal_code, sample?.animal_name].filter(Boolean).join(' · ');

  return {
    barcode,
    animalLine: truncate(animalLine, 28),
    testLine: truncate(testLine, 30),
  };
};

/** Standalone 50×25 mm print page — never includes modal UI. */
export const buildLabelPrintDocument = (sample, { isArabic = false, autoPrint = false } = {}) => {
  const { barcode, animalLine, testLine } = labelMetaFromSample(sample, isArabic);
  const barcodeJson = JSON.stringify(barcode || 'NO-BARCODE');
  const autoPrintScript = autoPrint ? `
      window.onload = function () {
        setTimeout(function () { window.focus(); window.print(); }, 150);
      };
      window.onafterprint = function () { window.close(); };
  ` : `
      window.renderLabel = function () {
        var code = ${barcodeJson};
        if (code && document.getElementById('sample-barcode')) {
          JsBarcode('#sample-barcode', code, {
            format: 'CODE128', width: 1.05, height: 22, displayValue: true,
            fontSize: 10, margin: 0, background: '#ffffff', lineColor: '#000000'
          });
        }
      };
      window.renderLabel();
  `;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>Label</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>${LABEL_PRINT_STYLES}</style>
</head>
<body>
  <div class="label-50x25">
    ${barcode ? '<svg id="sample-barcode"></svg>' : '<p class="label-50x25-error">No barcode</p>'}
    ${animalLine ? `<p class="label-50x25-line">${escapeHtml(animalLine)}</p>` : ''}
    ${testLine ? `<p class="label-50x25-line label-50x25-tests">${escapeHtml(testLine)}</p>` : ''}
  </div>
  <script>
    (function () {
      var code = ${barcodeJson};
      if (code && document.getElementById('sample-barcode')) {
        JsBarcode('#sample-barcode', code, {
          format: 'CODE128', width: 1.05, height: 22, displayValue: true,
          fontSize: 10, margin: 0, background: '#ffffff', lineColor: '#000000'
        });
      }
      ${autoPrintScript}
    })();
  <\/script>
</body>
</html>`;
};

const labelBodyHtml = (sample, isArabic) => {
  const { barcode, animalLine, testLine } = labelMetaFromSample(sample, isArabic);
  return `
  <div class="label-50x25 label-page">
    ${barcode ? `<svg class="sample-barcode" data-code="${escapeHtml(barcode)}"></svg>` : '<p class="label-50x25-error">No barcode</p>'}
    ${animalLine ? `<p class="label-50x25-line">${escapeHtml(animalLine)}</p>` : ''}
    ${testLine ? `<p class="label-50x25-line label-50x25-tests">${escapeHtml(testLine)}</p>` : ''}
  </div>`;
};

/** One print job — one label per test tube (package expands to multiple pages). */
export const buildMultiLabelPrintDocument = (samples, { isArabic = false, autoPrint = false } = {}) => {
  const list = (samples || []).filter(Boolean);
  if (!list.length) return buildLabelPrintDocument(null, { isArabic, autoPrint });

  const pages = list.map((sample) => labelBodyHtml(sample, isArabic)).join('\n');
  const autoPrintScript = autoPrint ? `
      window.onload = function () {
        setTimeout(function () { window.focus(); window.print(); }, 350);
      };
      window.onafterprint = function () { window.close(); };
  ` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>Labels</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    ${LABEL_PRINT_STYLES}
    body { width: 50mm; }
    .label-page {
      page-break-after: always;
      break-after: page;
    }
    .label-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  </style>
</head>
<body>
  ${pages}
  <script>
    (function () {
      document.querySelectorAll('svg.sample-barcode').forEach(function (el, idx) {
        var code = el.getAttribute('data-code');
        if (!code) return;
        el.id = 'sample-barcode-' + idx;
        JsBarcode('#sample-barcode-' + idx, code, {
          format: 'CODE128', width: 1.05, height: 22, displayValue: true,
          fontSize: 10, margin: 0, background: '#ffffff', lineColor: '#000000'
        });
      });
      ${autoPrintScript}
    })();
  <\/script>
</body>
</html>`;
};

const getPrintFrame = () => {
  let iframe = document.getElementById('lims-label-print-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'lims-label-print-frame';
    iframe.title = 'label-print';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
  }
  return iframe;
};

const triggerFramePrint = (iframe, { waitMs = 180 } = {}) => new Promise((resolve) => {
  const win = iframe.contentWindow;
  const run = () => {
    win.focus();
    win.print();
    resolve(true);
  };
  setTimeout(run, waitMs);
});

/** Print all label jobs in one browser print dialog (one page per test tube). */
export async function printLabelsViaIframe(samples, { isArabic = false } = {}) {
  const list = (samples || []).filter(Boolean);
  if (!list.length) return false;

  const iframe = getPrintFrame();
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildMultiLabelPrintDocument(list, { isArabic, autoPrint: false }));
  doc.close();
  await triggerFramePrint(iframe, { waitMs: 200 + list.length * 100 });
  return true;
}

/** Print via hidden iframe — works without popups. */
export async function printLabelViaIframe(sample, { isArabic = false } = {}) {
  return printLabelsViaIframe([sample], { isArabic });
}

/** Print existing on-screen label preview (modal already rendered barcode). */
export async function printLabelFromPreview() {
  const el = document.querySelector('.label-preview.label-50x25') || document.querySelector('.label-preview');
  if (!el) return false;

  const iframe = getPrintFrame();
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${LABEL_PRINT_STYLES}</style></head><body>${el.outerHTML}</body></html>`);
  doc.close();
  await triggerFramePrint(iframe, { waitMs: 80 });
  return true;
}

export function openLabelPrintWindow(sample, { isArabic = false, samples = null } = {}) {
  const list = samples?.length ? samples : (sample ? [sample] : []);
  if (!list.length) return false;

  const html = list.length > 1
    ? buildMultiLabelPrintDocument(list, { isArabic, autoPrint: true })
    : buildLabelPrintDocument(list[0], { isArabic, autoPrint: true });
  const win = window.open('', '_blank', 'noopener,noreferrer,width=320,height=200');
  if (!win) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
