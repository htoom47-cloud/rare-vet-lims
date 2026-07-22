import toast from 'react-hot-toast';
import i18n from '../i18n';
import { samplesAPI } from '../services/api';
import {
  printToZebra,
  isZebraBridgeAvailable,
} from './zebraPrint';
import { labelHasValidBarcode } from './labelPanel';
import {
  buildBrowserPrintHtml,
  printLabelsViaIframeSync,
  writeBrowserPrintToWindow,
} from './labelPrintHtml';
import { expandSampleLabelJobs, expandSamplesForLabelPrint } from './labelCopies';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const logPrintError = (scope, error) => {
  // eslint-disable-next-line no-console
  console.error(`[LIMS-print] ${scope}`, error);
};

const jobsHaveValidBarcode = (jobs) => (
  jobs.some((job) => labelHasValidBarcode(job))
);

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

const openFallbackPrintWindow = () => {
  try {
    return window.open(
      'about:blank',
      '_blank',
      'width=420,height=320,menubar=no,toolbar=no,location=no,status=no'
    );
  } catch {
    return null;
  }
};

const printJobsToZebra = async (jobs, { isArabic = false } = {}) => {
  let printed = 0;
  let lastDevice = 'Zebra';
  let lastError = null;

  for (let i = 0; i < jobs.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await printToZebra(jobs[i], { isArabic });
      printed += 1;
      lastDevice = result.device || lastDevice;
      // eslint-disable-next-line no-await-in-loop
      await sleep(120);
    } catch (error) {
      lastError = error;
      break;
    }
  }

  return { printed, total: jobs.length, lastDevice, lastError };
};

const browserPrintJobs = (jobs, { isArabic, fallbackWin = null } = {}) => {
  if (fallbackWin && writeBrowserPrintToWindow(fallbackWin, jobs, { isArabic, autoPrint: true })) {
    return 'browser';
  }

  const html = buildBrowserPrintHtml(jobs, { isArabic, autoPrint: true });
  if (!html) return 'build_failed';

  const win = openFallbackPrintWindow();
  if (win && writeBrowserPrintToWindow(win, jobs, { isArabic, autoPrint: true })) {
    return 'browser';
  }

  if (printLabelsViaIframeSync(jobs, { isArabic })) {
    return 'browser';
  }

  return 'popup_blocked';
};

const toastZebraBridgeHelp = async () => {
  const bridgeUp = await isZebraBridgeAvailable();
  if (bridgeUp) {
    toast.error(i18n.t('samples.zebraPrintFailed'), { duration: 8000 });
    return;
  }
  toast.error(i18n.t('samples.zebraBridgeRequired'), { duration: 12000 });
};

/**
 * Print from modal — Zebra ZPL first, then isolated 50×25 mm browser page (not the LIMS app).
 * Opens a blank window synchronously on click so browser print still works if Zebra fails.
 */
export async function printSampleLabelFromModal(sample) {
  if (!sample) return 'failed';

  let jobs = expandSampleLabelJobs(sample);
  if (!jobs.length || !jobsHaveValidBarcode(jobs)) {
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
    return 'failed';
  }

  // Reception labels are Arabic: test type, animal type, animal name + barcode/sample id.
  const isArabic = true;
  const fallbackWin = openFallbackPrintWindow();

  const { jobs: enrichedJobs } = await enrichPrintJobs(sample);
  jobs = enrichedJobs.length ? enrichedJobs : jobs;

  if (!jobsHaveValidBarcode(jobs)) {
    try { fallbackWin?.close(); } catch { /* ignore */ }
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
    return 'failed';
  }

  const zebra = await printJobsToZebra(jobs, { isArabic });

  if (zebra.printed === zebra.total) {
    try { fallbackWin?.close(); } catch { /* ignore */ }
    toast.success(
      jobs.length > 1
        ? i18n.t('samples.zebraPrintMultipleOk', { count: zebra.printed, printer: zebra.lastDevice })
        : i18n.t('samples.zebraPrintOk', { printer: zebra.lastDevice })
    );
    return 'zebra';
  }

  if (zebra.printed > 0) {
    toast.success(
      i18n.t('samples.zebraPrintPartial', {
        printed: zebra.printed,
        total: zebra.total,
        printer: zebra.lastDevice,
      })
    );
  }

  const browserResult = browserPrintJobs(jobs, { isArabic, fallbackWin });
  if (browserResult === 'browser') {
    if (zebra.printed === 0) {
      toast.success(i18n.t('samples.browserPrintOk'));
    }
    return 'browser';
  }

  try { fallbackWin?.close(); } catch { /* ignore */ }
  await toastZebraBridgeHelp();
  if (browserResult === 'popup_blocked') {
    toast.error(i18n.t('samples.printDialogFailed'), { duration: 8000 });
  }
  if (zebra.lastError?.code === 'EMPTY_LABEL_DATA' || zebra.lastError?.code === 'EMPTY_ZPL') {
    toast.error(zebra.lastError.message, { duration: 10000 });
  }
  return 'failed';
}

/** @deprecated use printSampleLabelFromModal — browser-only fallback without Zebra */
export function printSampleLabelWithDialogSync(sample) {
  if (!sample) return 'failed';
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length || !jobsHaveValidBarcode(jobs)) return 'build_failed';
  return browserPrintJobs(jobs, { isArabic: i18n.language === 'ar' });
}

/** Auto-print after registration — Zebra ZPL only (silent, no print dialog). */
export async function autoPrintSampleLabels(samples) {
  const jobs = expandSamplesForLabelPrint(samples);
  if (!jobs.length) {
    return { printed: 0, total: 0, reason: null };
  }

  if (!jobsHaveValidBarcode(jobs)) {
    return { printed: 0, total: jobs.length, reason: 'invalid_barcode' };
  }

  // Always Arabic graphic labels for reception (test/animal type+name in Arabic).
  const isArabic = true;
  const zebra = await printJobsToZebra(jobs, { isArabic });
  return {
    printed: zebra.printed,
    total: jobs.length,
    reason: zebra.printed === 0 ? 'zebra_failed' : null,
  };
}

/**
 * @param {object} sample
 * @param {{ showDialog?: boolean }} options — showDialog = modal print (Zebra then browser).
 */
export function printSampleLabel(sample, { showDialog = false } = {}) {
  if (!sample) return Promise.resolve('failed');

  if (showDialog) {
    return printSampleLabelFromModal(sample);
  }

  return printSampleLabelViaZebra(sample);
}

async function printSampleLabelViaZebra(sample) {
  try {
    const { jobs } = await enrichPrintJobs(sample);
    if (!jobs.length) {
      toast.error(i18n.t('samples.labelPrintFailed'));
      return 'failed';
    }

    if (!jobsHaveValidBarcode(jobs)) {
      toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
      return 'failed';
    }

    // Always Arabic graphic labels for reception.
    const isArabic = true;
    const zebra = await printJobsToZebra(jobs, { isArabic });

    if (zebra.printed === zebra.total) {
      toast.success(
        jobs.length > 1
          ? i18n.t('samples.zebraPrintMultipleOk', { count: zebra.printed, printer: zebra.lastDevice })
          : i18n.t('samples.zebraPrintOk', { printer: zebra.lastDevice })
      );
      return 'zebra';
    }

    if (zebra.printed > 0) {
      toast.success(
        i18n.t('samples.zebraPrintPartial', {
          printed: zebra.printed,
          total: zebra.total,
          printer: zebra.lastDevice,
        })
      );
    }

    await toastZebraBridgeHelp();
    toast.error(i18n.t('samples.zebraUsePreviewPrint'), { duration: 10000 });
    if (zebra.lastError?.code === 'EMPTY_LABEL_DATA' || zebra.lastError?.code === 'EMPTY_ZPL') {
      toast.error(zebra.lastError.message, { duration: 10000 });
    }
    return 'failed';
  } catch (error) {
    logPrintError('printSampleLabelViaZebra', error);
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
    return 'failed';
  }
}
