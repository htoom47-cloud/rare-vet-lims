import { ANIMAL_TYPES, animalTypeLabel as staticLabel } from '../constants/animalTypes';
import { animalSpeciesAPI } from '../services/api';

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

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

/** Zebra ZPL — ASCII English only; never Arabic (falls back to code). */
export const speciesLabelForZpl = (code) => {
  const key = String(code || '').trim();
  if (!key) return '';
  const entry = labelMap[key] || labelMap[key.toLowerCase()];
  if (entry?.en && !ARABIC_RE.test(entry.en)) return entry.en;
  const staticEn = ANIMAL_TYPES[key]?.en || ANIMAL_TYPES[key.toLowerCase()]?.en;
  if (staticEn) return staticEn;
  return key;
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
