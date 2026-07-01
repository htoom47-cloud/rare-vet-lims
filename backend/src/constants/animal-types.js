/** Active animal types — order matches registration UI. */
const ANIMAL_TYPE_CODES = ['camel', 'sheep', 'horse', 'goat', 'other'];

const ANIMAL_TYPE_LABELS = {
  camel: { en: 'Camel', ar: 'إبل' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  horse: { en: 'Horse', ar: 'خيل' },
  goat: { en: 'Goat', ar: 'ماعز' },
  other: { en: 'Other', ar: 'أخرى' },
  // legacy enum values (pre-migration records)
  bird: { en: 'Other', ar: 'أخرى' },
  cat: { en: 'Other', ar: 'أخرى' },
  dog: { en: 'Other', ar: 'أخرى' },
};

module.exports = { ANIMAL_TYPE_CODES, ANIMAL_TYPE_LABELS };
