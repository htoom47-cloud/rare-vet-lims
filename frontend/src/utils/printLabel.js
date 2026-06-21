import toast from 'react-hot-toast';
import i18n from '../i18n';
import { printToZebra, isBrowserPrintMissing } from './zebraPrint';

/** Auto-print labels after registration (ZPL, no dialog). Returns count printed. */
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

/** Fallback: browser print dialog for 50×25 mm thermal labels. */
export function printThermalLabel() {  const el = document.querySelector('.label-preview');
  if (!el) {
    window.print();
    return;
  }

  const styles = `
    @page { size: 50mm 25mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: 50mm; height: 25mm; overflow: hidden; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .label-preview { box-sizing: border-box; }
    svg { max-width: 100%; height: auto; }
  `;

  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) {
    window.print();
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label</title><style>${styles}</style></head><body>${el.outerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.onafterprint = () => win.close();
  };
}

/**
 * Print sample label: Zebra Browser Print (silent) → browser print dialog fallback.
 * @returns {Promise<'zebra'|'browser'>}
 */
export async function printSampleLabel(sample) {
  if (!sample) {
    printThermalLabel();
    return 'browser';
  }
  const labelElement = document.querySelector('.label-preview');  const isArabic = i18n.language === 'ar';

  try {
    const result = await printToZebra(sample, { isArabic, labelElement });
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
    printThermalLabel();
    return 'browser';
  }
}

/**
 * Print multiple labels sequentially (e.g. after multi-animal registration).
 * @deprecated Use autoPrintSampleLabels for silent batch print.
 */
export async function printSampleLabels(samples, { renderBetweenMs = 400 } = {}) {
  for (let i = 0; i < samples.length; i += 1) {
    if (i > 0 && renderBetweenMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, renderBetweenMs); });
    }
    // eslint-disable-next-line no-await-in-loop
    await printSampleLabel(samples[i]);
  }
}
