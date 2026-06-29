export const PARAS_CATEGORY_CODE = 'MICRO';

export const PARAS_BRU_ROSE = 'BRU-ROSE-BENGAL';
export const PARAS_BLOOD = 'PARAS-BLOOD';
export const PARAS_STOOL = 'PARAS-STOOL';

export const MICRO_PANEL_ORDER = {
  [PARAS_BLOOD]: 0,
  [PARAS_BRU_ROSE]: 1,
  [PARAS_STOOL]: 2,
};

export const panelI18nKey = (testCode) => {
  if (testCode === PARAS_BLOOD) return 'parasitology.bloodSection';
  if (testCode === PARAS_STOOL) return 'parasitology.stoolSection';
  if (testCode === PARAS_BRU_ROSE) return 'parasitology.brucellaSection';
  return null;
};

export const isParasitologyTest = (test) =>
  (test?.category_code || test?.categoryCode) === PARAS_CATEGORY_CODE;

export const sortParasSampleTests = (tests = []) =>
  [...tests].filter(isParasitologyTest).sort((a, b) => {
    const codeA = a.test_code || a.code;
    const codeB = b.test_code || b.code;
    const ao = MICRO_PANEL_ORDER[codeA] ?? 99;
    const bo = MICRO_PANEL_ORDER[codeB] ?? 99;
    if (ao !== bo) return ao - bo;
    return (a.test_name || a.name || codeA || '').localeCompare(b.test_name || b.name || codeB || '');
  });

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
