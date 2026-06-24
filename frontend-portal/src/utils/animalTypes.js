export const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' },
  horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' },
  cat: { en: 'Cat', ar: 'قط' },
  dog: { en: 'Dog', ar: 'كلب' },
};

export const animalLabel = (type, isAr) => {
  const e = ANIMAL_TYPES[type];
  return e ? (isAr ? e.ar : e.en) : (type || '—');
};

const GENDERS = {
  male: { en: 'Male', ar: 'ذكر' },
  female: { en: 'Female', ar: 'أنثى' },
  unknown: { en: '—', ar: '—' },
};

export const genderLabel = (gender, isAr) => {
  const e = GENDERS[gender];
  return e ? (isAr ? e.ar : e.en) : (gender || '—');
};
