import { useEffect, useState } from 'react';
import { publicApi } from '../services/publicApi';

export default function usePublicCatalog() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    publicApi.catalog()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error, tests: data?.tests ?? [], categories: data?.categories ?? [], stats: data?.stats };
}
