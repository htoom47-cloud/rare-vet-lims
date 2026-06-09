import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, X } from 'lucide-react';
import { customersAPI } from '../../services/api';

export default function CustomerSearch({ value, onChange, placeholder, required = false, autoFocus = false }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    customersAPI.get(value).then(({ data }) => setSelected(data.data)).catch(() => setSelected(null));
  }, [value]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      const trimmed = query.trim();
      const looksLikeMobile = /^[\d+\s()-]{3,}$/.test(trimmed);
      const params = looksLikeMobile ? { mobile: trimmed, limit: 15 } : { search: trimmed, limit: 15 };
      customersAPI.list(params)
        .then(({ data }) => {
          setResults(data.data);
          setOpen(true);
          if (looksLikeMobile && data.data.length === 1) {
            const customer = data.data[0];
            setSelected(customer);
            setQuery('');
            setResults([]);
            setOpen(false);
            onChange?.(customer.id, customer);
          }
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectCustomer = (customer) => {
    setSelected(customer);
    setQuery('');
    setResults([]);
    setOpen(false);
    onChange?.(customer.id, customer);
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery('');
    onChange?.('', null);
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 p-3 border rounded-lg bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
        <div>
          <p className="font-medium">{selected.full_name}</p>
          <p className="text-sm text-gray-500 flex items-center gap-1"><Phone size={14} /> {selected.mobile}</p>
        </div>
        <button type="button" onClick={clearSelection} className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700">
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Phone size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="tel"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder || t('customers.searchByMobile')}
          className="input-field ps-10"
          required={required && !value}
          autoFocus={autoFocus}
        />
        {loading && <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{t('common.loading')}</span>}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => selectCustomer(c)}
                className="w-full text-start px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between gap-2"
              >
                <span className="font-medium">{c.full_name}</span>
                <span className="text-sm text-gray-500 font-mono">{c.mobile}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && !loading && results.length === 0 && (
        <p className="absolute z-20 w-full mt-1 p-3 text-sm text-gray-500 bg-white dark:bg-gray-800 border rounded-lg shadow">
          {t('customers.notFound')}
        </p>
      )}
    </div>
  );
}
