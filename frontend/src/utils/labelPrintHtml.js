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

export const labelMetaFromSample = (sample, isArabic = false) => {
  const barcode = String(sample?.barcode || sample?.sample_code || '').trim();
  const testLine = (sample?.tests || [])
    .map((t) => (isArabic ? t.test_name_ar : t.test_name) || t.test_name || t.test_code)
    .filter(Boolean)
    .join(' · ');
  const animalLine = [sample?.animal_code, sample?.animal_name].filter(Boolean).join(' · ');

  return {
    barcode,
    animalLine: truncate(animalLine, 32),
    testLine: truncate(testLine, 34),
  };
};

/** Standalone 50×25 mm print page — never includes modal UI. */
export const buildLabelPrintDocument = (sample, { isArabic = false } = {}) => {
  const { barcode, animalLine, testLine } = labelMetaFromSample(sample, isArabic);
  const barcodeJson = JSON.stringify(barcode || 'NO-BARCODE');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>Label</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    @page { size: 50mm 25mm; margin: 0; }
    html, body {
      margin: 0; padding: 0; width: 50mm; height: 25mm;
      overflow: hidden; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .label-50x25 {
      width: 50mm; height: 25mm; box-sizing: border-box;
      padding: 0.5mm 1.2mm 0.4mm;
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
      font-family: Arial, Helvetica, sans-serif; color: #000;
    }
    .label-50x25 svg { max-width: 100%; height: auto; display: block; }
    .label-50x25-line {
      margin: 0.2mm 0 0; padding: 0; font-size: 5.5pt; line-height: 1.05;
      text-align: center; max-width: 100%; overflow: hidden;
      white-space: nowrap; text-overflow: ellipsis;
    }
    .label-50x25-tests { font-weight: 600; }
    .label-50x25-error { font-size: 7pt; color: #c00; text-align: center; }
  </style>
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
          format: 'CODE128', width: 1.1, height: 28, displayValue: true,
          fontSize: 8, margin: 0, background: '#ffffff', lineColor: '#000000'
        });
      }
      function doPrint() {
        window.focus();
        window.print();
      }
      window.onload = function () {
        setTimeout(doPrint, 120);
      };
      window.onafterprint = function () { window.close(); };
    })();
  <\/script>
</body>
</html>`;
};

export function openLabelPrintWindow(sample, { isArabic = false } = {}) {
  if (!sample) return false;

  const html = buildLabelPrintDocument(sample, { isArabic });
  const win = window.open('', '_blank', 'noopener,noreferrer,width=320,height=200');
  if (!win) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
