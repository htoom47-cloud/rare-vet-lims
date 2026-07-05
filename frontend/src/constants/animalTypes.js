/** Active animal types — order: إبل، غنم، خيل، ماعز، أخرى */
export const ANIMAL_TYPE_CODES = ['camel', 'sheep', 'horse', 'goat', 'other'];

export const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  horse: { en: 'Horse', ar: 'خيل' },
  goat: { en: 'Goat', ar: 'ماعز' },
  other: { en: 'Other', ar: 'أخرى' },
  bird: { en: 'Other', ar: 'أخرى' },
  cat: { en: 'Cat', ar: 'قط' },
  dog: { en: 'Dog', ar: 'كلب' },
  cow: { en: 'Cow', ar: 'بقر' },
};

export const animalTypeLabel = (type, isAr) => {
  const entry = ANIMAL_TYPES[type];
  return entry ? (isAr ? entry.ar : entry.en) : (type || '—');
};
