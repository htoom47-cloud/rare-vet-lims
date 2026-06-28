import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Printer, Package } from 'lucide-react';
import { testsAPI, billingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getCategoryEmoji } from '../utils/testCategoryIcons';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

export default function PriceList() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const canViewPackages = hasPermission('billing.view');

  const [tests, setTests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const displayName = (item) => (i18n.language === 'ar' && item?.name_ar ? item.name_ar : item?.name);
  const catLabel = (cat) => (i18n.language === 'ar' && cat?.name_ar ? cat.name_ar : cat?.name);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      testsAPI.list({ limit: 500 }),
      testsAPI.categories(),
      canViewPackages ? billingAPI.packages().catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
    ])
      .then(([testsRes, catsRes, pkgRes]) => {
        setTests(testsRes.data.data || []);
        setCategories(catsRes.data.data || []);
        setPackages(pkgRes.data.data || []);
      })
      .finally(() => setLoading(false));
  }, [canViewPackages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tests.filter((test) => {
      if (categoryFilter && String(test.category_id) !== String(categoryFilter)) return false;
      if (!q) return true;
      return [test.name, test.name_ar, test.code].some((s) => String(s || '').toLowerCase().includes(q));
    });
  }, [tests, search, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const test of filtered) {
      const key = test.category_id || '__other__';
      if (!map.has(key)) {
        const cat = categories.find((c) => c.id === test.category_id);
        map.set(key, { cat, items: [] });
      }
      map.get(key).items.push(test);
    }
    return [...map.values()].sort((a, b) => {
      const na = catLabel(a.cat) || 'zzz';
      const nb = catLabel(b.cat) || 'zzz';
      return na.localeCompare(nb, i18n.language === 'ar' ? 'ar' : 'en');
    });
  }, [filtered, categories, i18n.language]);

  const totalTests = filtered.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('priceList.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('priceList.subtitle')}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-sm no-print">
          <Printer size={16} /> {t('priceList.print')}
        </button>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 no-print">
        <div className="md:col-span-2 relative">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            className="input-field ps-9"
            placeholder={t('priceList.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t('priceList.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{getCategoryEmoji(c)} {catLabel(c)}</option>
          ))}
        </select>
      </div>

      {canViewPackages && packages.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2 text-primary-800">
            <Package size={18} /> {t('priceList.packages')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="card p-4 border-primary-100">
                <p className="font-semibold">{pkg.name}</p>
                {pkg.description && <p className="text-xs text-gray-500 mt-1">{pkg.description}</p>}
                <p className="text-xl font-bold text-primary-600 mt-2">{fmt(pkg.price)}</p>
                {pkg.test_names?.filter(Boolean).length > 0 && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{pkg.test_names.join('، ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{t('priceList.testCount', { count: totalTests })}</span>
        <span>{t('priceList.vatNote')}</span>
      </div>

      {loading ? (
        <p className="text-center py-12 text-gray-500">{t('common.loading')}</p>
      ) : grouped.length === 0 ? (
        <p className="text-center py-12 text-gray-500">{t('priceList.noResults')}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, items }) => (
            <div key={cat?.id || 'other'} className="card overflow-hidden">
              <div className="bg-primary-50 dark:bg-primary-900/20 px-4 py-3 border-b flex items-center gap-2">
                <span className="text-lg">{getCategoryEmoji(cat)}</span>
                <h3 className="font-semibold">{catLabel(cat) || t('priceList.otherCategory')}</h3>
                <span className="text-xs text-gray-500 ms-auto">{items.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-start">
                      <th className="p-3 font-semibold w-28">{t('tests.code')}</th>
                      <th className="p-3 font-semibold">{t('tests.nameEn')}</th>
                      <th className="p-3 font-semibold hidden sm:table-cell">{t('priceList.turnaround')}</th>
                      <th className="p-3 font-semibold text-end w-32">{t('priceList.price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((test) => (
                      <tr key={test.id} className="border-b last:border-0 hover:bg-gray-50/80">
                        <td className="p-3 font-mono text-xs text-gray-600">{test.code}</td>
                        <td className="p-3">
                          <p className="font-medium">{displayName(test)}</p>
                          {i18n.language === 'ar' && test.name && test.name !== test.name_ar && (
                            <p className="text-xs text-gray-500">{test.name}</p>
                          )}
                        </td>
                        <td className="p-3 hidden sm:table-cell text-gray-600">
                          {test.turnaround_hours ? t('priceList.hours', { h: test.turnaround_hours }) : '—'}
                        </td>
                        <td className="p-3 text-end font-bold text-primary-700">{fmt(test.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
