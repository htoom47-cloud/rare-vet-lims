export const PARAS_BRU_ROSE = 'BRU-ROSE-BENGAL';
export const PARAS_TEST_CODES = ['PARAS-BLOOD', 'PARAS-STOOL', PARAS_BRU_ROSE];
export const PARAS_TEST_CODES_SET = new Set(PARAS_TEST_CODES);

export const isParasitologyTest = (test) =>
  PARAS_TEST_CODES_SET.has(test?.test_code || test?.code);

export const filterNonParasTests = (tests = []) =>
  tests.filter((t) => !isParasitologyTest(t));

export const filterParasTests = (tests = []) =>
  tests.filter(isParasitologyTest);

/** Routes for result entry — parasitology tests use /parasitology only. */
export const getResultsEntryTargets = (sampleId, tests = []) => {
  const nonParas = filterNonParasTests(tests);
  const paras = filterParasTests(tests);
  return {
    workbench: nonParas.length > 0 ? `/workbench?sample=${sampleId}` : null,
    parasitology: paras.length > 0 ? `/parasitology?sample=${sampleId}` : null,
  };
};
