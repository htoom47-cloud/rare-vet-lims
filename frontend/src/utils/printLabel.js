import toast from 'react-hot-toast';
import i18n from '../i18n';
import { samplesAPI } from '../services/api';
import {
  printToZebra,
  getLabelPrintFields,
  isZebraBridgeAvailable,
} from './zebraPrint';
import {
  buildLabelPrintDocument,
  buildMultiLabelPrintDocument,
  printLabelsViaIframeSync,
  printSampleLabelInPlace,
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

/**
 * Synchronous print — MUST run directly inside the click handler (before any await).
 * Browsers block window.print() when called after async gaps (lost user activation).
 */
export function printSampleLabelWithDialogSync(sample) {
  if (!sample) return 'failed';

  if (printSampleLabelInPlace()) {
    return 'browser';
  }

  const isArabic = i18n.language === 'ar';
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return 'failed';

  const html = jobs.length > 1
    ? buildMultiLabelPrintDocument(jobs, { isArabic, autoPrint: true })
    : buildLabelPrintDocument(jobs[0], { isArabic, autoPrint: true });

  const win = window.open('about:blank', '_blank', 'width=420,height=420,menubar=no,toolbar=no,location=no');
  if (win) {
    try {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      return 'browser';
    } catch {
      try { win.close(); } catch { /* ignore */ }
    }
  }

  if (printLabelsViaIframeSync(jobs, { isArabic })) {
    return 'browser';
  }

  return 'popup_blocked';
}

/** @deprecated use printSampleLabelWithDialogSync from click handlers */
export async function printSampleLabelWithDialog(sample) {
  const result = printSampleLabelWithDialogSync(sample);
  if (result === 'failed') {
    toast.error(i18n.t('samples.labelPrintFailed'));
    return 'failed';
  }
  if (result === 'popup_blocked') {
    toast.error(i18n.t('samples.zebraPrintPopupBlocked'), { duration: 8000 });
    return 'failed';
  }
  return 'browser';
}

const toastZebraBridgeHelp = async () => {
  const bridgeUp = await isZebraBridgeAvailable();
  if (bridgeUp) {
    toast.error(i18n.t('samples.zebraPrintFailed'), { duration: 8000 });
    return;
  }
  toast.error(i18n.t('samples.zebraBridgeRequired'), { duration: 12000 });
};

/** Auto-print after registration — Zebra ZPL only (silent, no print dialog). */
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
 * @param {object} sample
 * @param {{ showDialog?: boolean }} options — showDialog opens browser print dialog (UI button).
 */
export function printSampleLabel(sample, { showDialog = false } = {}) {
  if (!sample) return Promise.resolve('failed');

  if (showDialog) {
    const result = printSampleLabelWithDialogSync(sample);
    if (result === 'browser') {
      toast.success(i18n.t('samples.browserPrintOk'));
    } else if (result === 'popup_blocked') {
      toast.error(i18n.t('samples.zebraPrintPopupBlocked'), { duration: 8000 });
    } else {
      toast.error(i18n.t('samples.labelPrintFailed'));
    }
    return Promise.resolve(result);
  }

  return printSampleLabelViaZebra(sample);
}

async function printSampleLabelViaZebra(sample) {
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
      // eslint-disable-next-line no-await-in-loop
      const result = await printToZebra(jobs[i], { isArabic });
      zebraPrinted += 1;
      lastDevice = result.device || lastDevice;
      // eslint-disable-next-line no-await-in-loop
      await sleep(120);
    } catch (error) {
      lastZebraError = error;
      break;
    }
  }

  if (zebraPrinted === jobs.length) {
    toast.success(
      jobs.length > 1
        ? i18n.t('samples.zebraPrintMultipleOk', { count: zebraPrinted, printer: lastDevice })
        : i18n.t('samples.zebraPrintOk', { printer: lastDevice })
    );
    return 'zebra';
  }

  if (zebraPrinted > 0) {
    toast.success(
      i18n.t('samples.zebraPrintPartial', { printed: zebraPrinted, total: jobs.length, printer: lastDevice })
    );
  }

  const dialogResult = printSampleLabelWithDialogSync(sample);
  if (dialogResult === 'browser') {
    toast.success(i18n.t('samples.browserPrintOk'));
    return 'browser';
  }

  await toastZebraBridgeHelp();
  if (lastZebraError?.code === 'EMPTY_LABEL_DATA' || lastZebraError?.code === 'EMPTY_ZPL') {
    toast.error(lastZebraError.message, { duration: 10000 });
  }
  if (dialogResult === 'popup_blocked') {
    toast.error(i18n.t('samples.zebraPrintPopupBlocked'), { duration: 8000 });
  }
  return 'failed';
}
