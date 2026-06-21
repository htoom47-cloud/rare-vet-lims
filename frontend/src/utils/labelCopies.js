/** Barcode label copies configured per test in the catalog. */
export function labelCopiesForTest(test) {
  const n = parseInt(test?.label_copies, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Expand one sample into print jobs — one job per test × label_copies. */
export function expandSampleLabelJobs(sample) {
  if (!sample) return [];

  const tests = sample.tests?.filter(Boolean);
  if (!tests?.length) {
    return [sample];
  }

  const jobs = [];
  for (const test of tests) {
    const copies = labelCopiesForTest(test);
    for (let i = 0; i < copies; i += 1) {
      jobs.push({ ...sample, tests: [test] });
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
