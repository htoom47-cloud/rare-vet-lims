import toast from 'react-hot-toast';
import i18n from '../i18n';
import { samplesAPI } from '../services/api';
import { printToZebra, isBrowserPrintMissing, getLabelPrintFields } from './zebraPrint';
import {
  buildLabelPrintDocument,
  buildMultiLabelPrintDocument,
  buildMultiLabelPrintDocumentWithImage,
  openPrintDocumentWindow,
  printLabelsViaIframe,
  printSampleLabelInPlace,
} from './labelPrintHtml';
import { expandSampleLabelJobs, expandSamplesForLabelPrint } from './labelCopies';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const printSampleLabelBrowser = async (sample, { isArabic }) => {
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return false;

  // 1) Print modal preview in-place (barcode SVG already on screen — no popup).
  if (printSampleLabelInPlace()) return true;

  // 2) Server PNG + sync SVG popup fallback.
  if (sample.id) {
    try {
      const { data } = await samplesAPI.getBarcode(sample.id);
      const img = data?.data?.image;
      if (img) {
        const html = buildMultiLabelPrintDocumentWithImage(jobs, img, { isArabic, autoPrint: true });
        if (openPrintDocumentWindow(html)) return true;
        throw new Error('POPUP_BLOCKED');
      }
    } catch (error) {
      if (error.message === 'POPUP_BLOCKED') throw error;
      if (error.response?.data?.error?.code === 'INVOICE_REQUIRED') throw error;
    }
  }

  const html = jobs.length > 1
    ? buildMultiLabelPrintDocument(jobs, { isArabic, autoPrint: true })
    : buildLabelPrintDocument(jobs[0], { isArabic, autoPrint: true });
  if (openPrintDocumentWindow(html)) return true;

  return printLabelsViaIframe(jobs, { isArabic });
};

/** Auto-print after registration — Zebra first; modal opens if bridge unavailable. */
export async function autoPrintSampleLabels(samples) {
  const isArabic = i18n.language === 'ar';
  const jobs = expandSamplesForLabelPrint(samples);
  let printed = 0;

  for (let i = 0; i < jobs.length; i += 1) {
    try {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[LIMS-Zebra] autoPrint job', i + 1, '/', jobs.length, getLabelPrintFields(jobs[i], { isArabic }));
      }
      // eslint-disable-next-line no-await-in-loop
      await printToZebra(jobs[i], { isArabic });
      printed += 1;
      // eslint-disable-next-line no-await-in-loop
      await sleep(120);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LIMS-Zebra] autoPrint failed job', i + 1, error?.message || error);
    }
  }

  return printed;
}

/**
 * Print sample label(s).
 * @param {object} sample
 * @param {{ preferBrowser?: boolean }} options — preferBrowser skips Zebra (modal Print button).
 */
export async function printSampleLabel(sample, { preferBrowser = false } = {}) {
  if (!sample) return 'failed';

  const isArabic = i18n.language === 'ar';
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return 'failed';

  let zebraPrinted = 0;
  let lastDevice = 'Zebra';
  let lastZebraError = null;

  if (!preferBrowser) {
    for (let i = 0; i < jobs.length; i += 1) {
      try {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[LIMS-Zebra] printSampleLabel job', i + 1, '/', jobs.length, getLabelPrintFields(jobs[i], { isArabic }));
        }
        // eslint-disable-next-line no-await-in-loop
        const result = await printToZebra(jobs[i], { isArabic });
        zebraPrinted += 1;
        lastDevice = result.device || lastDevice;
        // eslint-disable-next-line no-await-in-loop
        await sleep(120);
      } catch (error) {
        lastZebraError = error;
        // eslint-disable-next-line no-console
        console.error('[LIMS-Zebra] printSampleLabel failed', error?.message || error, error?.code);
        break;
      }
    }

    if (zebraPrinted === jobs.length) {
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

    if (zebraPrinted > 0) {
      toast.success(
        i18n.t('samples.zebraPrintPartial', { printed: zebraPrinted, total: jobs.length, printer: lastDevice })
      );
    }
  }

  try {
    const browserOk = await printSampleLabelBrowser(sample, { isArabic });
    if (browserOk) {
      toast.success(i18n.t('samples.browserPrintOk'));
      return 'browser';
    }
  } catch (browserError) {
    if (browserError.message === 'POPUP_BLOCKED') {
      toast.error(i18n.t('samples.zebraPrintPopupBlocked'), { duration: 8000 });
      return 'failed';
    }
    if (browserError.response?.data?.error?.code === 'INVOICE_REQUIRED') {
      toast.error(i18n.t('workflow.invoiceRequiredForBarcode'));
      return 'failed';
    }
    // eslint-disable-next-line no-console
    console.error('[LIMS] browser label print failed', browserError?.message || browserError);
  }

  if (preferBrowser) {
    toast.error(i18n.t('samples.labelPrintFailed'));
    return 'failed';
  }

  if (isBrowserPrintMissing(lastZebraError)) {
    toast.error(i18n.t('samples.zebraBridgeRequired'), { duration: 8000 });
  } else if (lastZebraError?.code === 'EMPTY_LABEL_DATA' || lastZebraError?.code === 'EMPTY_ZPL') {
    toast.error(lastZebraError.message, { duration: 10000 });
  } else if (lastZebraError) {
    toast.error(i18n.t('samples.zebraPrintFailed'));
  } else {
    toast.error(i18n.t('samples.labelPrintFailed'));
  }
  return 'failed';
}
