export const formatHerdDate = (value, isAr) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const formatHerdDateTime = (value, isAr) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(isAr ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const isoDate = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

export const formatComputedAge = (age, isAr) => {
  if (!age) return null;
  const y = age.years || 0;
  const m = age.months || 0;
  if (!y && !m) return isAr ? 'أقل من شهر' : 'Under 1 month';
  if (isAr) {
    const ys = y ? `${y} ${y === 1 ? 'سنة' : 'سنوات'}` : '';
    const ms = m ? `${m} ${m === 1 ? 'شهر' : 'أشهر'}` : '';
    return [ys, ms].filter(Boolean).join(' و ');
  }
  const ys = y ? `${y}y` : '';
  const ms = m ? `${m}m` : '';
  return [ys, ms].filter(Boolean).join(' ');
};

export const herdAgeBucket = (animal) => {
  const months = animal?.age_computed?.total_months;
  if (months == null || Number.isNaN(Number(months))) return 'unknown';
  const n = Number(months);
  if (n < 12) return 'under1';
  if (n < 36) return '1to3';
  if (n < 60) return '3to5';
  return 'over5';
};

/** Keep in sync with backend/src/constants/breeder.js ADULT_MONTHS. */
const ADULT_MONTHS = {
  camel: 36,
  horse: 36,
  sheep: 12,
  goat: 12,
  cow: 24,
  cattle: 24,
  buffalo: 30,
  default: 24,
};

export const isAdultFemale = (animal) => {
  if (animal?.gender !== 'female') return false;
  const months = animal?.age_computed?.total_months;
  if (months == null || Number.isNaN(Number(months))) return false;
  const need = ADULT_MONTHS[String(animal.animal_type || '').toLowerCase()] ?? ADULT_MONTHS.default;
  return Number(months) >= need;
};

/** Adult female, or a female that has produced offspring. */
export const isHerdMother = (animal) => {
  if (animal?.gender !== 'female') return false;
  if ((animal.offspring_count || 0) > 0 || animal.is_mother) return true;
  return isAdultFemale(animal);
};

export const filterHerdAnimals = (animals, { role = 'all', age = 'all', vax = 'all' } = {}) => {
  const list = Array.isArray(animals) ? animals : [];
  return list.filter((a) => {
    if (role === 'mothers' && !isHerdMother(a)) return false;
    if (role === 'sires' && !a.is_sire) return false;
    if (role === 'offspring' && !a.is_offspring) return false;
    if (age !== 'all' && herdAgeBucket(a) !== age) return false;
    if (vax === 'vaccinated' && !(a.vaccination_count > 0)) return false;
    if (vax === 'unvaccinated' && a.vaccination_count > 0) return false;
    if (vax === 'due' && !(a.vaccinations_due > 0)) return false;
    return true;
  });
};

export const dueStatus = (nextDue) => {
  if (!nextDue) return null;
  const due = new Date(nextDue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 14) return 'due';
  return 'ok';
};
