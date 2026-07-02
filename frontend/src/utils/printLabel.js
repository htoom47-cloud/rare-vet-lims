import toast from 'react-hot-toast';
import i18n from '../i18n';
import { printToZebra, isBrowserPrintMissing, getLabelPrintFields } from './zebraPrint';
import { expandSampleLabelJobs, expandSamplesForLabelPrint } from './labelCopies';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Auto-print after registration (RAW ZPL only — never window.print). */
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

/** Print sample label(s): RAW ZPL only (Zebra Browser Print or local RAW bridge). */
export async function printSampleLabel(sample) {
  if (!sample) return 'failed';

  const isArabic = i18n.language === 'ar';
  const jobs = expandSampleLabelJobs(sample);
  if (!jobs.length) return 'failed';

  let zebraPrinted = 0;
  let lastDevice = 'Zebra';

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
      // eslint-disable-next-line no-console
      console.error('[LIMS-Zebra] printSampleLabel failed', error?.message || error, error?.code);
      if (zebraPrinted > 0) {
        toast.success(
          i18n.t('samples.zebraPrintPartial', { printed: zebraPrinted, total: jobs.length, printer: lastDevice })
        );
      }

      if (isBrowserPrintMissing(error)) {
        toast.error(i18n.t('samples.zebraBridgeRequired'), { duration: 8000 });
      } else if (error?.code === 'EMPTY_LABEL_DATA' || error?.code === 'EMPTY_ZPL') {
        toast.error(error.message, { duration: 10000 });
      } else {
        toast.error(i18n.t('samples.zebraPrintFailed'));
      }
      return 'failed';
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