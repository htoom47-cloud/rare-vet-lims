export const packageTestIds = (pkg) => {
  const ids = pkg?.test_ids;
  if (!ids) return [];
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
};

export const testsFromPackages = (packageIds = [], packages = []) => {
  const set = new Set();
  for (const id of packageIds) {
    const pkg = packages.find((p) => p.id === id);
    packageTestIds(pkg).forEach((testId) => set.add(testId));
  }
  return [...set];
};

export const resolveAnimalTestIds = (individualTestIds = [], packageIds = [], packages = []) => {
  const set = new Set([...individualTestIds, ...testsFromPackages(packageIds, packages)]);
  return [...set];
};

export const isTestCoveredByPackages = (testId, packageIds = [], packages = []) =>
  testsFromPackages(packageIds, packages).includes(testId);

export const animalServiceTotal = ({
  animalId,
  animalTests = {},
  animalPackages = {},
  tests = [],
  packages = [],
}) => {
  let sum = 0;
  for (const pkgId of animalPackages[animalId] || []) {
    const pkg = packages.find((p) => p.id === pkgId);
    sum += parseFloat(pkg?.price) || 0;
  }
  for (const testId of animalTests[animalId] || []) {
    if (isTestCoveredByPackages(testId, animalPackages[animalId], packages)) continue;
    const test = tests.find((x) => x.id === testId);
    sum += parseFloat(test?.price) || 0;
  }
  return sum;
};

export const animalHasServices = (animalId, animalTests = {}, animalPackages = {}) =>
  (animalTests[animalId] || []).length > 0 || (animalPackages[animalId] || []).length > 0;

export const packageLabel = (pkg, i18n) => (
  i18n.language === 'ar' && pkg?.name_ar ? pkg.name_ar : (pkg?.name || '')
);
