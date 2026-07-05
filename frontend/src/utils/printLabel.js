import toast from 'react-hot-toast';
import i18n from '../i18n';
import { samplesAPI } from '../services/api';
import {
  printToZebra,
  isBrowserPrintMissing,
  getLabelPrintFields,
  isZebraBridgeAvailable,
} from './zebraPrint';
import {
  buildLabelPrintDocument,
  buildMultiLabelPrintDocument,
  buildMultiLabelPrintDocumentWithImage,
  openPrintDocumentWindow,
} from './labelPrintHtml';
import { expandSampleLabelJobs, expandSamplesForLabelPrint } from './labelCopies';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const enrichPrintJobs = async (sample) => {
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return { jobs: [], fresh: sample };

  let fresh = sample;
  if (sample?.id) {
    try {
      const { data } = await samplesAPI.get(sample.id);
      fresh = data.data;
    } catch {
      /* row data */
    }
  }

  return {
    fresh,
    jobs: jobs.map((job) => ({ ...job, ...fresh, tests: job.tests || fresh.tests })),
  };
};

const buildBrowserPrintHtml = async (jobs, fresh, { isArabic }) => {
  if (fresh?.id) {
    try {
      const { data } = await samplesAPI.getBarcode(fresh.id);
      const img = data?.data?.image;
      if (img) {
        return buildMultiLabelPrintDocumentWithImage(jobs, img, { isArabic, autoPrint: false });
      }
    } catch (error) {
      if (error.response?.data?.error?.code === 'INVOICE_REQUIRED') throw error;
    }
  }

  return jobs.length > 1
    ? buildMultiLabelPrintDocument(jobs, { isArabic, autoPrint: false })
    : buildLabelPrintDocument(jobs[0], { isArabic, autoPrint: false });
};

/** Browser fallback — manual print window (GDI). Thermal ZD421 needs Zebra bridge + ZPL. */
const printSampleLabelBrowser = async (sample, { isArabic }) => {
  const { jobs, fresh } = await enrichPrintJobs(sample);
  if (!jobs.length) return false;

  const html = await buildBrowserPrintHtml(jobs, fresh, { isArabic });
  if (!html) return false;

  if (openPrintDocumentWindow(html)) return true;
  throw new Error('POPUP_BLOCKED');
};

const toastZebraBridgeHelp = async () => {
  const bridgeUp = await isZebraBridgeAvailable();
  if (bridgeUp) {
    toast.error(i18n.t('samples.zebraPrintFailed'), { duration: 8000 });
    return;
  }
  toast.error(i18n.t('samples.zebraBridgeRequired'), { duration: 12000 });
};

/** Auto-print after registration — Zebra ZPL only. */
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
 * Print sample label(s): Zebra ZPL first (ZD421), then browser preview window.
 */
export async function printSampleLabel(sample) {
  if (!sample) return 'failed';

  const isArabic = i18n.language === 'ar';
  const { jobs } = await enrichPrintJobs(sample);
  if (!jobs.length) {
    toast.error(i18n.t('samples.labelPrintFailed'));
    return 'failed';
  }

  let zebraPrinted = 0;
  let lastDevice = 'Zebra';
  let lastZebraError = null;

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
      toast.success(i18n.t('samples.zebraPrintMultipleOk', { count: zebraPrinted, printer: lastDevice }));
    } else {
      toast.success(i18n.t('samples.zebraPrintOk', { printer: lastDevice }));
    }
    return 'zebra';
  }

  if (zebraPrinted > 0) {
    toast.success(i18n.t('samples.zebraPrintPartial', { printed: zebraPrinted, total: jobs.length, printer: lastDevice }));
  }

  try {
    const browserOk = await printSampleLabelBrowser(sample, { isArabic });
    if (browserOk) {
      toast(i18n.t('samples.browserPrintManual'), { duration: 9000, icon: '🖨️' });
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

  await toastZebraBridgeHelp();
  if (lastZebraError?.code === 'EMPTY_LABEL_DATA' || lastZebraError?.code === 'EMPTY_ZPL') {
    toast.error(lastZebraError.message, { duration: 10000 });
  }
  return 'failed';
}
