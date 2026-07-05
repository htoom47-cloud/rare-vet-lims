import JsBarcode from 'jsbarcode';
import { buildThermalLabelContent, barcodeEncodeDigits } from './labelPanel';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const LABEL_PRINT_STYLES = `
  @media screen {
    html, body { background: #f3f4f6; margin: 0; padding: 8px; }
    .label-50x25, .label-page {
      border: 1px dashed #9ca3af;
      background: #fff;
      margin-bottom: 6px;
    }
  }
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
  function finishPrint() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete) {
        setTimeout(finishPrint, 80);
        return;
      }
    }
  window.__limsLabelReady = true;
  window.focus();
  window.print();
  window.onafterprint = function () {
    try { window.close(); } catch (e) { /* ignore */ }
  };
}
  if (document.readyState === 'complete') setTimeout(finishPrint, 350);
  else window.addEventListener('load', function () { setTimeout(finishPrint, 350); });
`;

const printToolbar = (isArabic = false) => `
  <div class="lims-print-toolbar">
    <p class="lims-print-hint">${isArabic
    ? 'لطباعة الملصق على Zebra: شغّل <strong>start-zebra-bridge.bat</strong> على جهاز الاستقبال ثم أعد المحاولة من LIMS. للطباعة من المتصفح: اختر <strong>ZDesigner ZD421</strong> ثم اضغط الزر أدناه.'
    : 'For Zebra labels: run <strong>start-zebra-bridge.bat</strong> on reception PC, then retry from LIMS. Browser fallback: select <strong>ZDesigner ZD421</strong> and click below.'}</p>
    <button type="button" class="lims-print-btn" onclick="window.print()">${isArabic ? 'طباعة الملصق' : 'Print label'}</button>
  </div>
  <style>
    @media print { .lims-print-toolbar { display: none !important; } }
    .lims-print-toolbar {
      padding: 12px 10px 8px; text-align: center; font-family: Arial, Tahoma, sans-serif;
      max-width: 420px; margin: 0 auto 8px;
    }
    .lims-print-hint { font-size: 12px; line-height: 1.45; margin: 0 0 12px; color: #1f2937; }
    .lims-print-btn {
      font-size: 16px; padding: 10px 28px; cursor: pointer;
      background: #2563eb; color: #fff; border: none; border-radius: 8px; font-weight: 600;
    }
  </style>`;

const wrapPrintDocument = ({ title, body, autoPrint = false, extraStyles = '', isArabic = false }) => `<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${isArabic ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${LABEL_PRINT_STYLES}${extraStyles}</style>
</head>
<body>
  ${autoPrint ? '' : printToolbar(isArabic)}
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
    isArabic,
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
    isArabic,
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
    isArabic,
  });
};

/** Open standalone print page and run window.print() from inline script when autoPrint. */
export function openPrintDocumentWindow(html) {
  if (!html) return false;
  const win = window.open('about:blank', '_blank', 'width=420,height=420,menubar=no,toolbar=no,location=no');
  if (!win) return false;
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    return true;
  } catch {
    win.close();
    return false;
  }
}

export function openLabelPrintWindow(sample, { isArabic = false, samples = null } = {}) {
  const list = samples?.length ? samples : (sample ? [sample] : []);
  if (!list.length) return false;

  const html = list.length > 1
    ? buildMultiLabelPrintDocument(list, { isArabic, autoPrint: true })
    : buildLabelPrintDocument(list[0], { isArabic, autoPrint: true });
  return openPrintDocumentWindow(html);
}

/** Print labels already visible in the open modal — must call window.print() synchronously from click handler. */
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

  // Force layout so @media print rules apply before print (still sync — user gesture preserved).
  void document.body.offsetHeight;
  window.print();
  setTimeout(cleanup, 5000);

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

export function printLabelsViaIframeSync(samples, { isArabic = false } = {}) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : (samples ? [samples] : []);
  if (!list.length) return false;

  const iframe = getPrintFrame();
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildMultiLabelPrintDocument(list, { isArabic, autoPrint: false }));
  doc.close();
  void iframe.contentDocument?.body?.offsetHeight;
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  return true;
}

export async function printLabelsViaIframe(samples, { isArabic = false, autoPrint = false } = {}) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : (samples ? [samples] : []);
  if (!list.length) return false;

  if (!autoPrint) {
    return printLabelsViaIframeSync(samples, { isArabic });
  }

  const iframe = getPrintFrame();
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildMultiLabelPrintDocument(list, { isArabic, autoPrint: true }));
  doc.close();

  await new Promise((resolve) => {
    const win = iframe.contentWindow;
    const started = Date.now();
    const tick = () => {
      if (win.__limsLabelReady || Date.now() - started > 6000) {
        resolve(true);
        return;
      }
      setTimeout(tick, 80);
    };
    setTimeout(tick, 400);
  });
  return true;
}

export async function printLabelViaIframe(sample, { isArabic = false } = {}) {
  return printLabelsViaIframe([sample], { isArabic });
}

export async function printLabelFromPreview() {
  return printSampleLabelInPlace();
}
