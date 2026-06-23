/** Standalone lab report print/PDF — isolated iframe mirroring on-screen layout */
import { LAB_REPORT_PRINT_STYLES } from './report-designs/design-1-print';

const absolutizeUrl = (url) => {
  if (!url || url.startsWith('http') || url.startsWith('data:')) return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
};

const prepareReportHtml = (reportElement) => {
  const clone = reportElement.cloneNode(true);
  clone.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || img.src;
    if (src) img.setAttribute('src', absolutizeUrl(src));
  });
  clone.querySelectorAll('.lab-rpt-image-card').forEach((card) => {
    const img = card.querySelector('img');
    const cap = card.querySelector('.lab-rpt-image-caption')?.textContent?.trim();
    if (img && (img.src.startsWith('data:image/svg') || img.getAttribute('src')?.startsWith('data:image/svg'))) {
      card.innerHTML = cap ? `<div class="lab-rpt-image-fallback">${cap}</div>` : '';
    }
  });
  return clone.innerHTML;
};

export const buildLabReportPrintDocument = (reportElement, { isAr = false, dir } = {}) => {
  const resolvedDir = dir || reportElement?.closest('[dir]')?.getAttribute('dir') || (isAr ? 'rtl' : 'ltr');
  const bodyClass = resolvedDir === 'rtl' ? 'lab-report-ar' : '';
  const html = prepareReportHtml(reportElement);
  return `<!DOCTYPE html>
<html lang="${resolvedDir === 'rtl' ? 'ar' : 'en'}" dir="${resolvedDir}">
<head>
  <meta charset="utf-8">
  <title>Lab Report</title>
  <style>${LAB_REPORT_PRINT_STYLES}</style>
</head>
<body class="${bodyClass}">
  <div class="lab-report-document lab-report-a4 ${bodyClass}">
    ${html}
  </div>
</body>
</html>`;
};

const getPrintFrame = () => {
  let iframe = document.getElementById('lims-lab-report-print-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'lims-lab-report-print-frame';
    iframe.title = 'lab-report-print';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
  }
  return iframe;
};

const writeReportToFrame = (reportElement, { isAr = false, forCapture = false } = {}) => {
  const iframe = getPrintFrame();
  if (forCapture) {
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1200px;border:0;opacity:0;pointer-events:none';
  } else {
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildLabReportPrintDocument(reportElement, { isAr }));
  doc.close();
  return iframe;
};

const waitForFrameImages = (doc) => Promise.all(
  [...doc.querySelectorAll('img')].map(
    (img) => new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return; }
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 2500);
    })
  )
);

const triggerFramePrint = (iframe, { waitMs = 350 } = {}) => new Promise((resolve) => {
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    resolve(true);
  }, waitMs);
});

export async function printLabReport(reportElement, { isAr = false } = {}) {
  if (!reportElement) return false;
  const iframe = writeReportToFrame(reportElement, { isAr });
  await waitForFrameImages(iframe.contentWindow.document);
  await triggerFramePrint(iframe);
  return true;
}

export async function downloadLabReportPdf(reportElement, { isAr = false, filename = 'report.pdf' } = {}) {
  if (!reportElement) return false;
  const iframe = writeReportToFrame(reportElement, { isAr, forCapture: true });
  const doc = iframe.contentWindow.document;
  await waitForFrameImages(doc);

  const target = doc.querySelector('.lab-report-document');
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  try {
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: target.scrollWidth,
      height: target.scrollHeight,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
      window: iframe.contentWindow,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const margin = 6;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;
    const imgH = (canvas.height * contentW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (imgH <= contentH + 2) {
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, imgH);
    } else {
      let heightLeft = imgH;
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, imgH);
      heightLeft -= contentH;
      while (heightLeft > 4) {
        const offset = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, offset, contentW, imgH);
        heightLeft -= contentH;
      }
    }

    pdf.save(filename);
    return true;
  } finally {
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  }
}
