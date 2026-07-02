import { buildThermalLabelContent, barcodeEncodeDigits } from './labelPanel';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const LABEL_PRINT_STYLES = `
  @page { size: 50mm 25mm; margin: 0; }
  html, body {
    margin: 0; padding: 0;
    width: 50mm; height: 25mm;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    background: #fff;
  }
  .label-50x25 {
    width: 50mm; height: 25mm; max-height: 25mm; box-sizing: border-box;
    padding: 0.4mm 1mm 0.3mm;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    font-family: Arial, Helvetica, sans-serif; color: #000;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .label-50x25-barcode-wrap {
    width: 100%; flex-shrink: 0; display: flex; flex-direction: column; align-items: center;
    line-height: 0;
  }
  .label-50x25-barcode-wrap svg { max-width: 100%; max-height: 10.5mm; height: auto; display: block; }
  .label-50x25-digits {
    margin: 0.2mm 0 0; padding: 0;
    font-size: 10.5pt; font-weight: 800; line-height: 1.05;
    text-align: center; letter-spacing: 0.08em;
    font-family: Consolas, 'Courier New', monospace;
  }
  .label-50x25-line {
    margin: 0.12mm 0 0; padding: 0;
    font-size: 8pt; line-height: 1.15;
    text-align: center; max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-weight: 600;
  }
  .label-50x25-line.label-50x25-meta { font-weight: 500; }
  .label-50x25-line.label-50x25-test { font-weight: 700; }
  .label-50x25-error { font-size: 7pt; color: #c00; text-align: center; }
`;

export const labelMetaFromSample = (sample, isArabic = false) => (
  buildThermalLabelContent(sample, { isArabic })
);

const labelBodyInner = (content) => {
  const encodeValue = content.barcodeEncode || barcodeEncodeDigits(content.barcode);
  return `
    <div class="label-50x25-barcode-wrap">
      ${encodeValue
    ? `<svg class="sample-barcode" data-code="${escapeHtml(encodeValue)}"></svg>`
    : '<p class="label-50x25-error">No barcode</p>'}
      ${content.barcodeDigits
    ? `<p class="label-50x25-digits">${escapeHtml(content.barcodeDigits)}</p>`
    : ''}
    </div>
    ${content.animalLine ? `<p class="label-50x25-line label-50x25-meta" title="${escapeHtml(content.animalLine)}">${escapeHtml(content.animalLine)}</p>` : ''}
    ${content.testLine ? `<p class="label-50x25-line label-50x25-test" title="${escapeHtml(content.testLine)}">${escapeHtml(content.testLine)}</p>` : ''}`;
};

const renderBarcodeScript = (autoPrint) => {
  const autoPrintScript = autoPrint ? `
      window.onload = function () {
        setTimeout(function () { window.focus(); window.print(); }, 150);
      };
      window.onafterprint = function () { window.close(); };
  ` : '';

  return `
    (function () {
      document.querySelectorAll('svg.sample-barcode').forEach(function (el, idx) {
        var code = el.getAttribute('data-code');
        if (!code) return;
        el.id = 'sample-barcode-' + idx;
        JsBarcode('#sample-barcode-' + idx, code, {
          format: 'CODE128', width: 1.05, height: 20, displayValue: false,
          margin: 0, background: '#ffffff', lineColor: '#000000'
        });
      });
      ${autoPrintScript}
    })();
  `;
};

/** Standalone 50×25 mm print page — never includes modal UI. */
export const buildLabelPrintDocument = (sample, { isArabic = false, autoPrint = false } = {}) => {
  const content = labelMetaFromSample(sample, isArabic);

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
    ${labelBodyInner(content)}
  </div>
  <script>${renderBarcodeScript(autoPrint)}<\/script>
</body>
</html>`;
};

const labelBodyHtml = (sample, isArabic) => {
  const content = labelMetaFromSample(sample, isArabic);
  return `<div class="label-50x25 label-page">${labelBodyInner(content)}</div>`;
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
    html, body { width: 50mm; }
    .label-page {
      width: 50mm;
      height: 25mm;
      max-height: 25mm;
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
  <script>${renderBarcodeScript(autoPrint)}<\/script>
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

/** @deprecated GDI/browser print only — prints blank on Zebra thermal. Do not use for labels. */
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
