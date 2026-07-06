import { panelDisplayName, resolvePanelKey, sortPanelKeys } from './labelPanel';

/** Barcode label copies configured per test in the catalog. */
export function labelCopiesForTest(test) {
  const n = parseInt(test?.label_copies, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Expand sample → print jobs.
 * One label per lab panel (health package → CBC + parasites + chemistry = 3 labels).
 */
export function expandSampleLabelJobs(sample) {
  if (!sample) return [];

  const tests = sample.tests?.filter(Boolean);
  if (!tests?.length) {
    return [{ ...sample, panelKey: 'OTHER' }];
  }

  const groups = new Map();
  for (const test of tests) {
    const key = resolvePanelKey(test);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(test);
  }

  const panelKeys = sortPanelKeys([...groups.keys()]);
  const multiPanel = panelKeys.length > 1;

  const jobs = [];
  for (const key of panelKeys) {
    const groupTests = groups.get(key);
    // Multiple lab panels on one sample → one tube label per panel (CBC + CHEM = 2 labels).
    // label_copies applies only when the whole order is a single panel / single test.
    const copies = !multiPanel && groupTests.length === 1
      ? labelCopiesForTest(groupTests[0])
      : 1;
    for (let i = 0; i < copies; i += 1) {
      jobs.push({ ...sample, tests: groupTests, panelKey: key });
    }
  }
  return jobs;
}

export function expandSamplesForLabelPrint(samples) {
  return (samples || []).flatMap(expandSampleLabelJobs);
}

export function totalLabelCountForSample(sample) {
  return expandSampleLabelJobs(sample).length;
}

export function totalLabelCountForSamples(samples) {
  return expandSamplesForLabelPrint(samples).length;
}

export { panelCode, panelDisplayName, resolvePanelKey } from './labelPanel';
