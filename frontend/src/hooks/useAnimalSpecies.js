import { useCallback, useEffect, useMemo, useState } from 'react';
import { animalSpeciesAPI } from '../services/api';
import { ANIMAL_TYPE_CODES } from '../constants/animalTypes';
import { mergeSpeciesRows, speciesLabel } from '../utils/speciesLabels';

export function useAnimalSpecies() {
  const [species, setSpecies] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return animalSpeciesAPI.list()
      .then(({ data }) => {
        const rows = data.data || [];
        mergeSpeciesRows(rows);
        setSpecies(rows);
      })
      .catch(() => setSpecies([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const label = useCallback((code, isAr) => speciesLabel(code, isAr), []);

  const codes = useMemo(
    () => (species.length ? species.map((s) => s.code) : ANIMAL_TYPE_CODES),
    [species],
  );

  return { species, codes, label, loading, reload };
}
