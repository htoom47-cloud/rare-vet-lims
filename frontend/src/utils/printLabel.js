import toast from 'react-hot-toast';
import i18n from '../i18n';
import { samplesAPI } from '../services/api';
import {
  printToZebra,
  isZebraBridgeAvailable,
} from './zebraPrint';
import { labelHasValidBarcode } from './labelPanel';
import {
  buildLabelPrintDocument,
  buildMultiLabelPrintDocument,
  printLabelsViaIframeSync,
  printSampleLabelInPlace,
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

const buildPrintHtmlSafe = (jobs, isArabic) => {
  try {
    return jobs.length > 1
      ? buildMultiLabelPrintDocument(jobs, { isArabic, autoPrint: true })
      : buildLabelPrintDocument(jobs[0], { isArabic, autoPrint: true });
  } catch (error) {
    logPrintError('buildPrintHtmlSafe', error);
    return null;
  }
};

/**
 * Synchronous print — MUST run directly inside the click handler (before any await).
 * Browsers block window.print() when called after async gaps (lost user activation).
 */
export function printSampleLabelWithDialogSync(sample) {
  try {
    if (!sample) return 'failed';

    const isArabic = i18n.language === 'ar';
    const jobs = expandSampleLabelJobs(sample);
    if (!jobs.length) return 'failed';

    if (!jobsHaveValidBarcode(jobs)) return 'build_failed';

    if (printSampleLabelInPlace()) {
      return 'browser';
    }

    const html = buildPrintHtmlSafe(jobs, isArabic);
    if (!html) return 'build_failed';

    const win = window.open('about:blank', '_blank', 'width=420,height=420,menubar=no,toolbar=no,location=no');
    if (win) {
      try {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        return 'browser';
      } catch (error) {
        logPrintError('popup write', error);
        try { win.close(); } catch { /* ignore */ }
      }
    }

    if (printLabelsViaIframeSync(jobs, { isArabic })) {
      return 'browser';
    }

    return 'popup_blocked';
  } catch (error) {
    logPrintError('printSampleLabelWithDialogSync', error);
    return 'build_failed';
  }
}

/** @deprecated use printSampleLabelWithDialogSync from click handlers */
export async function printSampleLabelWithDialog(sample) {
  const result = printSampleLabelWithDialogSync(sample);
  if (result === 'browser') return 'browser';
  if (result === 'popup_blocked') {
    toast.error(i18n.t('samples.printDialogFailed'));
    return 'failed';
  }
  if (result === 'build_failed') {
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
    return 'failed';
  }
  toast.error(i18n.t('samples.labelPrintFailed'));
  return 'failed';
}

const toastZebraBridgeHelp = async () => {
  const bridgeUp = await isZebraBridgeAvailable();
  if (bridgeUp) {
    toast.error(i18n.t('samples.zebraPrintFailed'), { duration: 8000 });
    return;
  }
  toast.error(i18n.t('samples.zebraBridgeRequired'), { duration: 12000 });
};

/**
 * Auto-print after registration — Zebra ZPL only (silent, no print dialog).
 * @returns {{ printed: number, total: number, reason: 'invalid_barcode'|'zebra_failed'|null }}
 */
export async function autoPrintSampleLabels(samples) {
  const jobs = expandSamplesForLabelPrint(samples);
  if (!jobs.length) {
    return { printed: 0, total: 0, reason: null };
  }

  if (!jobsHaveValidBarcode(jobs)) {
    return { printed: 0, total: jobs.length, reason: 'invalid_barcode' };
  }

  let printed = 0;
  for (let i = 0; i < jobs.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await printToZebra(jobs[i]);
      printed += 1;
      // eslint-disable-next-line no-await-in-loop
      await sleep(120);
    } catch (error) {
      logPrintError(`autoPrint job ${i + 1}`, error);
    }
  }

  return {
    printed,
    total: jobs.length,
    reason: printed === 0 ? 'zebra_failed' : null,
  };
}

const toastPrintResult = (result) => {
  if (result === 'browser') {
    toast.success(i18n.t('samples.browserPrintOk'));
    return;
  }
  if (result === 'popup_blocked') {
    toast.error(i18n.t('samples.printDialogFailed'), { duration: 8000 });
    return;
  }
  if (result === 'build_failed') {
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'), { duration: 8000 });
    return;
  }
  toast.error(i18n.t('samples.labelPrintFailed'));
};

/**
 * @param {object} sample
 * @param {{ showDialog?: boolean }} options — showDialog opens browser print dialog (UI button).
 */
export function printSampleLabel(sample, { showDialog = false } = {}) {
  try {
    if (!sample) return Promise.resolve('failed');

    if (showDialog) {
      const result = printSampleLabelWithDialogSync(sample);
      toastPrintResult(result);
      return Promise.resolve(result === 'browser' ? 'browser' : 'failed');
    }

    return printSampleLabelViaZebra(sample);
  } catch (error) {
    logPrintError('printSampleLabel', error);
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
    return Promise.resolve('failed');
  }
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

    let zebraPrinted = 0;
    let lastDevice = 'Zebra';
    let lastZebraError = null;

    for (let i = 0; i < jobs.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await printToZebra(jobs[i]);
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

    await toastZebraBridgeHelp();
    toast.error(i18n.t('samples.zebraUsePreviewPrint'), { duration: 10000 });
    if (lastZebraError?.code === 'EMPTY_LABEL_DATA' || lastZebraError?.code === 'EMPTY_ZPL') {
      toast.error(lastZebraError.message, { duration: 10000 });
    }
    return 'failed';
  } catch (error) {
    logPrintError('printSampleLabelViaZebra', error);
    toast.error(i18n.t('samples.barcodeLabelBuildFailed'));
    return 'failed';
  }
}
