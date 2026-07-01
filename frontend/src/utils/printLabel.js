import toast from 'react-hot-toast';
import i18n from '../i18n';
import { printLabelsViaIframe, printLabelFromPreview, openLabelPrintWindow } from './labelPrintHtml';
import { printToZebra, isBrowserPrintMissing } from './zebraPrint';
import { expandSampleLabelJobs, expandSamplesForLabelPrint } from './labelCopies';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Browser print — one dialog, one page per test tube. */
export async function printAllThermalLabels(sample, { isArabic = i18n.language === 'ar' } = {}) {
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return false;

  try {
    const ok = await printLabelsViaIframe(jobs, { isArabic });
    if (ok) return true;
  } catch {
    /* fall through */
  }

  return openLabelPrintWindow(null, { isArabic, samples: jobs });
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
      // eslint-disable-next-line no-await-in-loop
      await sleep(120);
    } catch {
      /* try remaining labels */
    }
  }

  return printed;
}

/** Print sample label(s): Zebra ZPL (silent) → iframe/browser print fallback. */
export async function printSampleLabel(sample) {
  if (!sample) return 'browser';

  const isArabic = i18n.language === 'ar';
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return 'browser';

  let zebraPrinted = 0;
  let lastDevice = 'Zebra';

  for (let i = 0; i < jobs.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await printToZebra(jobs[i], { isArabic });
      zebraPrinted += 1;
      lastDevice = result.device || lastDevice;
      // eslint-disable-next-line no-await-in-loop
      await sleep(120);
    } catch (error) {
      if (zebraPrinted > 0) {
        toast.success(
          i18n.t('samples.zebraPrintPartial', { printed: zebraPrinted, total: jobs.length, printer: lastDevice })
        );
      }

      const fallbackOk = await printLabelsViaIframe(jobs.slice(zebraPrinted), { isArabic })
        || openLabelPrintWindow(null, { isArabic, samples: jobs.slice(zebraPrinted) });

      if (fallbackOk) {
        if (isBrowserPrintMissing(error) && zebraPrinted === 0) {
          toast(i18n.t('samples.zebraBrowserPrintHint'), { icon: 'ℹ️', duration: 6000 });
        }
        if (zebraPrinted === 0) {
          toast.success(i18n.t('samples.zebraBrowserFallbackOk'));
        }
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

/** Manual print from on-screen preview only (single visible label). */
export async function printVisibleLabelPreview() {
  try {
    return await printLabelFromPreview();
  } catch {
    return false;
  }
}
