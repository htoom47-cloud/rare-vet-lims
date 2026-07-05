import { useCallback, useEffect, useMemo, useState } from 'react';
import { animalSpeciesAPI } from '../services/api';
import { ANIMAL_TYPE_CODES, ANIMAL_TYPES, animalTypeLabel as staticLabel } from '../constants/animalTypes';

export function useAnimalSpecies() {
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return animalSpeciesAPI.list()
      .then(({ data }) => setSpecies(data.data || []))
      .catch(() => setSpecies([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const labelMap = useMemo(() => {
    const map = { ...ANIMAL_TYPES };
    for (const row of species) {
      map[row.code] = { en: row.name_en, ar: row.name_ar || row.name_en };
    }
    return map;
  }, [species]);

  const label = useCallback((code, isAr) => {
    const entry = labelMap[code];
    if (entry) return isAr ? (entry.ar || entry.en) : (entry.en || entry.ar);
    return staticLabel(code, isAr);
  }, [labelMap]);

  const codes = useMemo(
    () => (species.length ? species.map((s) => s.code) : ANIMAL_TYPE_CODES),
    [species],
  );

  return { species, codes, label, loading, reload };
}
