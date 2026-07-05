import JsBarcode from 'jsbarcode';
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
    background: #fff; color: #000;
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

export const labelMetaFromSample = (sample, isArabic = false) => (
  buildThermalLabelContent(sample, { isArabic })
);

/** Render Code128 SVG synchronously — no CDN / no async race. */
export const renderBarcodeSvgHtml = (encodeValue) => {
  const code = String(encodeValue || '').trim();
  if (!code) return '';
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, {
      format: 'CODE128',
      width: 1.05,
      height: 20,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return svg.outerHTML;
  } catch {
    return '';
  }
};

const labelBodyInner = (content) => {
  const encodeValue = content.barcodeEncode || barcodeEncodeDigits(content.barcode);
  const svgHtml = encodeValue ? renderBarcodeSvgHtml(encodeValue) : '';
  return `
    <div class="label-50x25-barcode-wrap">
      ${svgHtml || (encodeValue ? '<p class="label-50x25-error">Barcode error</p>' : '<p class="label-50x25-error">No barcode</p>')}
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
    </div>
    ${content.animalLine ? `<p class="label-50x25-line label-50x25-meta" title="${escapeHtml(content.animalLine)}">${escapeHtml(content.animalLine)}</p>` : ''}
    ${content.testLine ? `<p class="label-50x25-line label-50x25-test" title="${escapeHtml(content.testLine)}">${escapeHtml(content.testLine)}</p>` : ''}`;

const autoPrintScript = () => `
  window.__limsLabelReady = true;
  function finishPrint() {
    window.focus();
    window.print();
    window.onafterprint = function () { window.close(); };
  }
  if (document.readyState === 'complete') setTimeout(finishPrint, 200);
  else window.addEventListener('load', function () { setTimeout(finishPrint, 200); });
`;

const wrapPrintDocument = ({ title, body, autoPrint = false, extraStyles = '' }) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${LABEL_PRINT_STYLES}${extraStyles}</style>
</head>
<body>
  ${body}
  ${autoPrint ? `<script>${autoPrintScript()}<\/script>` : ''}
</body>
</html>`;

/** Standalone 50×25 mm print page — barcode SVG baked in (no CDN). */
export const buildLabelPrintDocument = (sample, { isArabic = false, autoPrint = false } = {}) => {
  const content = labelMetaFromSample(sample, isArabic);
  return wrapPrintDocument({
    title: 'Label',
    body: `<div class="label-50x25">${labelBodyInner(content)}</div>`,
    autoPrint,
  });
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
    autoPrint,
    extraStyles,
  });
};

/** One print job — one label per test tube (package expands to multiple pages). */
export const buildMultiLabelPrintDocument = (samples, { isArabic = false, autoPrint = false } = {}) => {
  const list = (samples || []).filter(Boolean);
  if (!list.length) return buildLabelPrintDocument(null, { isArabic, autoPrint });

  const pages = list.map((sample) => labelBodyHtml(sample, isArabic)).join('\n');
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
    autoPrint,
    extraStyles,
  });
};

let printBlobUrl = null;

const revokePrintBlobUrl = () => {
  if (printBlobUrl) {
    URL.revokeObjectURL(printBlobUrl);
    printBlobUrl = null;
  }
};

/** Open print HTML via blob URL — reliable across browsers (avoids blank named-window reuse). */
export function openPrintDocumentWindow(html, { autoPrint = true } = {}) {
  if (!html) return false;
  revokePrintBlobUrl();

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  printBlobUrl = URL.createObjectURL(blob);
  const win = window.open(printBlobUrl, '_blank', 'width=360,height=320,menubar=no,toolbar=no,location=no');
  if (!win) {
    revokePrintBlobUrl();
    return false;
  }

  win.addEventListener('load', () => {
    setTimeout(revokePrintBlobUrl, 60000);
  }, { once: true });

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

/** Print labels already visible in the open modal — no popup, uses printing-sample-label CSS. */
export function printSampleLabelInPlace() {
  const area = document.querySelector('[role="dialog"] .label-print-area');
  const previews = area
    ? area.querySelectorAll('.label-preview')
    : document.querySelectorAll('[role="dialog"] .label-preview, .label-print-area .label-preview');
  if (!previews.length) return false;

  const cleanup = () => {
    document.documentElement.classList.remove('printing-sample-label');
    document.body.classList.remove('printing-sample-label');
  };

  document.documentElement.classList.add('printing-sample-label');
  document.body.classList.add('printing-sample-label');

  const onAfterPrint = () => {
    cleanup();
    window.removeEventListener('afterprint', onAfterPrint);
  };
  window.addEventListener('afterprint', onAfterPrint);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      setTimeout(cleanup, 3000);
    });
  });

  return true;
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

export async function printLabelsViaIframe(samples, { isArabic = false } = {}) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : (samples ? [samples] : []);
  if (!list.length) return false;

  const iframe = getPrintFrame();
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildMultiLabelPrintDocument(list, { isArabic, autoPrint: false }));
  doc.close();

  await new Promise((resolve) => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      resolve(true);
    }, 400);
  });
  return true;
}

export async function printLabelViaIframe(sample, { isArabic = false } = {}) {
  return printLabelsViaIframe([sample], { isArabic });
}

export async function printLabelFromPreview() {
  return printSampleLabelInPlace();
}
