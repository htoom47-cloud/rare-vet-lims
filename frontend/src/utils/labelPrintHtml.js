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
    width: 50mm; min-height: 25mm;
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
  .label-50x25-barcode-wrap svg,
  .label-50x25-barcode svg {
    max-width: 100%; max-height: 10.5mm; height: auto; display: block;
  }
  .label-50x25-barcode-img {
    max-width: 100%; max-height: 11mm; height: auto; display: block;
  }
  .label-50x25-digits {
    margin: 0.2mm 0 0; padding: 0;
    font-size: 10.5pt; font-weight: 800; line-height: 1.05;
    text-align: center; letter-spacing: 0.08em;
    font-family: Consolas, 'Courier New', monospace;
  }
  .label-50x25-details {
    width: 100%; margin-top: 0.2mm; flex: 1;
    display: flex; flex-direction: column; justify-content: center; gap: 0.1mm; min-height: 0;
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

const PRINT_WINDOW_NAME = 'lims-label-print';

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

const labelBodyInnerWithImage = (content, barcodeImg) => `
    <div class="label-50x25-barcode-wrap">
      ${barcodeImg
    ? `<img class="label-50x25-barcode-img" src="${barcodeImg}" alt="" />`
    : '<p class="label-50x25-error">No barcode</p>'}
      ${content.barcodeDigits && !barcodeImg
    ? `<p class="label-50x25-digits">${escapeHtml(content.barcodeDigits)}</p>`
    : ''}
    </div>
    ${content.animalLine ? `<p class="label-50x25-line label-50x25-meta" title="${escapeHtml(content.animalLine)}">${escapeHtml(content.animalLine)}</p>` : ''}
    ${content.testLine ? `<p class="label-50x25-line label-50x25-test" title="${escapeHtml(content.testLine)}">${escapeHtml(content.testLine)}</p>` : ''}`;

const staticAutoPrintScript = (autoPrint) => {
  if (!autoPrint) {
    return 'window.__limsLabelReady = true;';
  }
  return `
    window.__limsLabelReady = true;
    function finishPrint() {
      window.focus();
      window.print();
      window.onafterprint = function () { window.close(); };
    }
    if (document.readyState === 'complete') setTimeout(finishPrint, 180);
    else window.addEventListener('load', function () { setTimeout(finishPrint, 180); });
  `;
};

const renderBarcodeScript = (autoPrint) => {
  const afterRender = autoPrint ? `
      window.__limsLabelReady = true;
      setTimeout(function () {
        window.focus();
        window.print();
        window.onafterprint = function () { window.close(); };
      }, 120);` : `
      window.__limsLabelReady = true;`;

  return `
    function renderSampleBarcodes() {
      if (typeof JsBarcode === 'undefined') return false;
      document.querySelectorAll('svg.sample-barcode').forEach(function (el, idx) {
        var code = el.getAttribute('data-code');
        if (!code) return;
        el.id = 'sample-barcode-' + idx;
        JsBarcode('#sample-barcode-' + idx, code, {
          format: 'CODE128', width: 1.05, height: 20, displayValue: false,
          margin: 0, background: '#ffffff', lineColor: '#000000'
        });
      });
      ${afterRender}
      return true;
    }
    function bootLabelPrint() {
      if (renderSampleBarcodes()) return;
      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        if (renderSampleBarcodes()) {
          clearInterval(timer);
          return;
        }
        if (attempts > 60) {
          clearInterval(timer);
          window.__limsLabelReady = true;
        }
      }, 50);
    }
    if (document.readyState === 'complete') bootLabelPrint();
    else window.addEventListener('load', bootLabelPrint);
  `;
};

const wrapPrintDocument = ({ title, body, script = '', extraStyles = '' }) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${LABEL_PRINT_STYLES}${extraStyles}</style>
</head>
<body>
  ${body}
  ${script ? `<script>${script}<\/script>` : ''}
</body>
</html>`;

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

const labelBodyHtmlWithImage = (sample, isArabic, barcodeImg) => {
  const content = labelMetaFromSample(sample, isArabic);
  return `<div class="label-50x25 label-page">${labelBodyInnerWithImage(content, barcodeImg)}</div>`;
};

/** Print page using server-rendered barcode PNG (no JsBarcode CDN). */
export const buildMultiLabelPrintDocumentWithImage = (samples, barcodeImg, { isArabic = false, autoPrint = false } = {}) => {
  const list = (samples || []).filter(Boolean);
  if (!list.length) return '';

  const pages = list.map((sample) => labelBodyHtmlWithImage(sample, isArabic, barcodeImg)).join('\n');
  const extraStyles = `
    html, body { width: 50mm; }
    .label-page {
      width: 50mm; height: 25mm; max-height: 25mm;
      page-break-after: always; break-after: page;
    }
    .label-page:last-child { page-break-after: auto; break-after: auto; }
  `;

  return wrapPrintDocument({
    title: 'Labels',
    body: pages,
    script: staticAutoPrintScript(autoPrint),
    extraStyles,
  });
};

/** Copy already-rendered preview nodes (react-barcode SVG) into a print window. */
export const buildPreviewPrintDocument = (previewHtml, { autoPrint = true } = {}) => wrapPrintDocument({
  title: 'Label',
  body: previewHtml,
  script: staticAutoPrintScript(autoPrint),
  extraStyles: `
    html, body { width: 50mm; }
    .label-page, .label-preview { page-break-after: always; break-after: page; }
    .label-page:last-child, .label-preview:last-child { page-break-after: auto; break-after: auto; }
  `,
});

/** One print job — one label per test tube (package expands to multiple pages). */
export const buildMultiLabelPrintDocument = (samples, { isArabic = false, autoPrint = false } = {}) => {
  const list = (samples || []).filter(Boolean);
  if (!list.length) return buildLabelPrintDocument(null, { isArabic, autoPrint });

  const pages = list.map((sample) => labelBodyHtml(sample, isArabic)).join('\n');

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

/** Open a dedicated print window (must not use noopener — document.write needs window ref). */
export function openPrintDocumentWindow(html) {
  if (!html) return false;
  const win = window.open('', PRINT_WINDOW_NAME, 'width=360,height=320,menubar=no,toolbar=no,location=no');
  if (!win) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

export function openLabelPrintWindow(sample, { isArabic = false, samples = null } = {}) {
  const list = samples?.length ? samples : (sample ? [sample] : []);
  if (!list.length) return false;

  const html = list.length > 1
    ? buildMultiLabelPrintDocument(list, { isArabic, autoPrint: true })
    : buildLabelPrintDocument(list[0], { isArabic, autoPrint: true });
  return openPrintDocumentWindow(html);
}

export function openLabelPrintWindowWithImages(samples, barcodeImg, { isArabic = false, autoPrint = true } = {}) {
  const list = (samples || []).filter(Boolean);
  if (!list.length || !barcodeImg) return false;
  const html = buildMultiLabelPrintDocumentWithImage(list, barcodeImg, { isArabic, autoPrint });
  return openPrintDocumentWindow(html);
}

/** Print on-screen previews from the open modal (barcode already rendered). */
export function printLabelsFromPreviewWindow() {
  const modalPreviews = document.querySelectorAll('[role="dialog"] .label-preview');
  const previews = modalPreviews.length
    ? modalPreviews
    : document.querySelectorAll('.label-preview.label-50x25, .label-preview');
  if (!previews.length) return false;

  const bodies = [...previews].map((el) => el.outerHTML).join('\n');
  const html = buildPreviewPrintDocument(bodies, { autoPrint: true });
  return openPrintDocumentWindow(html);
}

const getPrintFrame = () => {
  let iframe = document.getElementById('lims-label-print-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'lims-label-print-frame';
    iframe.title = 'label-print';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:50mm;height:25mm;border:0;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(iframe);
  }
  return iframe;
};

const waitForFrameReady = (iframe, { minWaitMs = 350, maxWaitMs = 12000 } = {}) => new Promise((resolve) => {
  const win = iframe.contentWindow;
  const started = Date.now();

  const tick = () => {
    const elapsed = Date.now() - started;
    const ready = win.__limsLabelReady;
    if ((ready && elapsed >= minWaitMs) || elapsed >= maxWaitMs) {
      win.focus();
      win.print();
      resolve(true);
      return;
    }
    setTimeout(tick, 60);
  };

  setTimeout(tick, minWaitMs);
});

export async function printLabelsViaIframe(samples, { isArabic = false } = {}) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : (samples ? [samples] : []);
  if (!list.length) return false;

  const iframe = getPrintFrame();
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildMultiLabelPrintDocument(list, { isArabic, autoPrint: false }));
  doc.close();
  await waitForFrameReady(iframe);
  return true;
}

export async function printLabelViaIframe(sample, { isArabic = false } = {}) {
  return printLabelsViaIframe([sample], { isArabic });
}

/** @deprecated Prefer printLabelsFromPreviewWindow — hidden iframe often yields blank print preview. */
export async function printLabelFromPreview() {
  return printLabelsFromPreviewWindow();
}
