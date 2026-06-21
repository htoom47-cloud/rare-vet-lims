import toast from 'react-hot-toast';
import i18n from '../i18n';
import { printLabelViaIframe, printLabelFromPreview, openLabelPrintWindow } from './labelPrintHtml';
import { printToZebra, isBrowserPrintMissing } from './zebraPrint';

/** Browser print fallback — iframe first (no popups), then optional new window. */
export async function printThermalLabel(sample, { isArabic = i18n.language === 'ar' } = {}) {
  if (document.querySelector('.label-preview')) {
    try {
      const ok = await printLabelFromPreview();
      if (ok) return true;
    } catch {
      /* fall through */
    }
  }

  if (sample) {
    try {
      const ok = await printLabelViaIframe(sample, { isArabic });
      if (ok) return true;
    } catch {
      /* fall through */
    }
  }

  return openLabelPrintWindow(sample, { isArabic });
}

/** Auto-print after registration (ZPL only). Returns count printed. */
export async function autoPrintSampleLabels(samples) {
  const isArabic = i18n.language === 'ar';
  let printed = 0;

  for (let i = 0; i < samples.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await printToZebra(samples[i], { isArabic });
      printed += 1;
    } catch {
      break;
    }
  }

  return printed;
}

/** Print sample label: Zebra ZPL (silent) → iframe/browser print fallback. */
export async function printSampleLabel(sample) {
  if (!sample) return 'browser';

  const isArabic = i18n.language === 'ar';

  try {
    const result = await printToZebra(sample, { isArabic });
    toast.success(
      i18n.t('samples.zebraPrintOk', { printer: result.device || 'Zebra' })
    );
    return 'zebra';
  } catch (error) {
    const fallbackOk = await printThermalLabel(sample, { isArabic });
    if (fallbackOk) {
      if (isBrowserPrintMissing(error)) {
        toast(i18n.t('samples.zebraBrowserPrintHint'), { icon: 'ℹ️', duration: 6000 });
      }
      toast.success(i18n.t('samples.zebraBrowserFallbackOk'));
      return 'browser';
    }

    if (isBrowserPrintMissing(error)) {
      toast.error(i18n.t('samples.zebraPrintMissing'));
    } else {
      toast.error(i18n.t('samples.zebraPrintFailed'));
    }
    return 'browser';
  }
}
