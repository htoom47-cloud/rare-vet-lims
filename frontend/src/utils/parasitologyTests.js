export const PARAS_CATEGORY_CODE = 'MICRO';

export const PARAS_BRU_ROSE = 'BRU-ROSE-BENGAL';
export const PARAS_BLOOD = 'PARAS-BLOOD';
export const PARAS_STOOL = 'PARAS-STOOL';

export const isParasitologyTest = (test) =>
  (test?.category_code || test?.categoryCode) === PARAS_CATEGORY_CODE;

export const filterNonParasTests = (tests = []) =>
  tests.filter((t) => !isParasitologyTest(t));

export const filterParasTests = (tests = []) =>
  tests.filter(isParasitologyTest);

/** Routes for result entry — MICRO category tests use /parasitology only. */
export const getResultsEntryTargets = (sampleId, tests = []) => {
  const nonParas = filterNonParasTests(tests);
  const paras = filterParasTests(tests);
  return {
    workbench: nonParas.length > 0 ? `/workbench?sample=${sampleId}` : null,
    parasitology: paras.length > 0 ? `/parasitology?sample=${sampleId}` : null,
  };
};
