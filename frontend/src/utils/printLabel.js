import toast from 'react-hot-toast';
import i18n from '../i18n';
import { openLabelPrintWindow } from './labelPrintHtml';
import { printToZebra, isBrowserPrintMissing } from './zebraPrint';

/** Browser print fallback — label only, never the modal/page. */
export function printThermalLabel(sample, { isArabic = i18n.language === 'ar' } = {}) {
  if (sample && openLabelPrintWindow(sample, { isArabic })) return true;

  const el = document.querySelector('.label-preview.label-50x25') || document.querySelector('.label-preview');
  if (!el) return false;

  const styles = `
    @page { size: 50mm 25mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: 50mm; height: 25mm; overflow: hidden; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    svg { max-width: 100%; height: auto; }
  `;

  const win = window.open('', '_blank', 'noopener,noreferrer,width=320,height=200');
  if (!win) return false;

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label</title><style>${styles}</style></head><body>${el.outerHTML}</body></html>`);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };
  return true;
}

/** Auto-print after registration (ZPL only). Returns count printed. */
export async function autoPrintSampleLabels(samples) {
  const isArabic = i18n.language === 'ar';
  let printed = 0;

  for (let i = 0; i < samples.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await printToZebra(samples[i], { isArabic, labelElement: null });
      printed += 1;
    } catch (error) {
      if (printed === 0 && isBrowserPrintMissing(error)) {
        toast.error(i18n.t('samples.zebraPrintMissing'));
      } else if (printed === 0) {
        toast.error(i18n.t('samples.zebraPrintFailed'));
      }
      break;
    }
  }

  return printed;
}

/** Print sample label: Zebra ZPL (silent) → clean label window (not modal). */
export async function printSampleLabel(sample) {
  if (!sample) return 'browser';

  const isArabic = i18n.language === 'ar';

  try {
    const result = await printToZebra(sample, { isArabic, labelElement: null });
    toast.success(
      result.method === 'image'
        ? i18n.t('samples.zebraPrintImageOk')
        : i18n.t('samples.zebraPrintOk', { printer: result.device || 'Zebra' })
    );
    return 'zebra';
  } catch (error) {
    if (isBrowserPrintMissing(error)) {
      toast.error(i18n.t('samples.zebraPrintMissing'));
    } else {
      toast.error(i18n.t('samples.zebraPrintFailed'));
    }
    const opened = printThermalLabel(sample, { isArabic });
    if (!opened) {
      toast.error(i18n.t('samples.zebraPrintPopupBlocked'));
    }
    return 'browser';
  }
}
