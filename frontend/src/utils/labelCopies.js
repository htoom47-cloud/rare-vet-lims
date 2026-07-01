/** Barcode label copies configured per test in the catalog. */
export function labelCopiesForTest(test) {
  const n = parseInt(test?.label_copies, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const CATEGORY_ORDER = {
  CBC: 0, CHEM: 1, HORM: 2, ELISA: 3, SERO: 4, PCR: 5, MICRO: 6, PARAS: 6, CULT: 7,
};

const categoryKey = (test) => String(test?.category_code || 'OTHER').toUpperCase();

const sortCategoryKeys = (keys) => [...keys].sort((a, b) => {
  const oa = CATEGORY_ORDER[a] ?? 99;
  const ob = CATEGORY_ORDER[b] ?? 99;
  if (oa !== ob) return oa - ob;
  return a.localeCompare(b);
});

/**
 * Expand sample → print jobs.
 * One label per lab panel/category (e.g. health package → CBC + parasites + chemistry = 3 labels).
 */
export function expandSampleLabelJobs(sample) {
  if (!sample) return [];

  const tests = sample.tests?.filter(Boolean);
  if (!tests?.length) {
    return [sample];
  }

  const groups = new Map();
  for (const test of tests) {
    const key = categoryKey(test);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(test);
  }

  const jobs = [];
  for (const key of sortCategoryKeys(groups.keys())) {
    const groupTests = groups.get(key);
    const copies = Math.max(1, ...groupTests.map(labelCopiesForTest));
    for (let i = 0; i < copies; i += 1) {
      jobs.push({ ...sample, tests: groupTests });
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
