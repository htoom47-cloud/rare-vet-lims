import { ANIMAL_TYPES, animalTypeLabel as staticLabel } from '../constants/animalTypes';
import { animalSpeciesAPI } from '../services/api';

let labelMap = { ...ANIMAL_TYPES };

export const mergeSpeciesRows = (rows = []) => {
  const next = { ...ANIMAL_TYPES };
  for (const row of rows) {
    if (!row?.code) continue;
    next[row.code] = {
      en: row.name_en || row.code,
      ar: row.name_ar || row.name_en || row.code,
    };
  }
  labelMap = next;
};

/** Resolve species label — uses DB cache when loaded, else static fallback. */
export const speciesLabel = (code, isArabic = false) => {
  const key = String(code || '').trim();
  if (!key) return '';
  const entry = labelMap[key] || labelMap[key.toLowerCase()];
  if (entry) return isArabic ? (entry.ar || entry.en) : (entry.en || entry.ar);
  return staticLabel(key, isArabic);
};

let bootstrapPromise = null;

/** Load custom species from API once per session (safe to call repeatedly). */
export const bootstrapSpeciesLabels = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = animalSpeciesAPI.list()
      .then(({ data }) => {
        mergeSpeciesRows(data.data || []);
      })
      .catch(() => {
        /* static ANIMAL_TYPES fallback */
      });
  }
  return bootstrapPromise;
};
