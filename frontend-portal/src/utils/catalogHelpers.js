import { SERVICE_DEPARTMENTS } from '../data/siteStructure';

/** Map category code → service department id */
export function deptIdForCategory(categoryCode) {
  if (!categoryCode) return null;
  const dept = SERVICE_DEPARTMENTS.find((d) => d.categories.includes(categoryCode));
  return dept?.id ?? null;
}

export function categoriesForDept(deptId) {
  const dept = SERVICE_DEPARTMENTS.find((d) => d.id === deptId);
  return dept?.categories ?? [];
}

export function categoriesForAnimal(animalId) {
  if (!animalId || animalId === 'all') return null;
  return SERVICE_DEPARTMENTS
    .filter((d) => d.animals?.includes(animalId))
    .flatMap((d) => d.categories);
}

export function testsForDept(tests, deptId) {
  const parasRe = /paras|طفيل|stool|fecal|براز|egg|بيض/i;
  if (deptId === 'parasitology') {
    return tests.filter((t) => t.category_code === 'MICRO' && parasRe.test([t.name, t.name_ar, t.code, t.description].filter(Boolean).join(' ')));
  }
  if (deptId === 'microbiology') {
    return tests.filter((t) => t.category_code === 'MICRO' && !parasRe.test([t.name, t.name_ar, t.code, t.description].filter(Boolean).join(' ')));
  }
  const codes = categoriesForDept(deptId);
  if (!codes.length) return [];
  return tests.filter((t) => codes.includes(t.category_code));
}
