import toast from 'react-hot-toast';
import i18n from '../i18n';
import { printLabelViaIframe, printLabelFromPreview, openLabelPrintWindow } from './labelPrintHtml';
import { printToZebra, isBrowserPrintMissing } from './zebraPrint';
import { expandSampleLabelJobs, expandSamplesForLabelPrint } from './labelCopies';

/** Browser print fallback for all label copies of one sample. */
export async function printAllThermalLabels(sample, { isArabic = i18n.language === 'ar' } = {}) {
  const jobs = expandSampleLabelJobs(sample);
  let ok = false;
  for (let i = 0; i < jobs.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const printed = await printThermalLabel(jobs[i], { isArabic });
    if (printed) ok = true;
  }
  return ok;
}

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
  const jobs = expandSamplesForLabelPrint(samples);
  let printed = 0;

  for (let i = 0; i < jobs.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await printToZebra(jobs[i], { isArabic });
      printed += 1;
    } catch {
      break;
    }
  }

  return printed;
}

/** Print sample label(s): Zebra ZPL (silent) → iframe/browser print fallback. */
export async function printSampleLabel(sample) {
  if (!sample) return 'browser';

  const isArabic = i18n.language === 'ar';
  const jobs = expandSampleLabelJobs(sample);

  let zebraPrinted = 0;
  let lastDevice = 'Zebra';

  for (let i = 0; i < jobs.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await printToZebra(jobs[i], { isArabic });
      zebraPrinted += 1;
      lastDevice = result.device || lastDevice;
    } catch (error) {
      if (zebraPrinted > 0) {
        toast.success(
          i18n.t('samples.zebraPrintPartial', { printed: zebraPrinted, total: jobs.length, printer: lastDevice })
        );
        return 'zebra';
      }

      const fallbackOk = await printAllThermalLabels(sample, { isArabic });
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

  if (jobs.length > 1) {
    toast.success(
      i18n.t('samples.zebraPrintMultipleOk', { count: zebraPrinted, printer: lastDevice })
    );
  } else {
    toast.success(
      i18n.t('samples.zebraPrintOk', { printer: lastDevice })
    );
  }
  return 'zebra';
}
