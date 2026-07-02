import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { animalsAPI } from '../services/api';
import { ANIMAL_TYPES } from '../constants/animalTypes';

const TEST_OPTIONS = [
  { code: 'CBC-FULL', labelEn: 'CBC', labelAr: 'صورة الدم' },
  { code: 'CHEM-PANEL', labelEn: 'Chemistry', labelAr: 'كيمياء الدم' },
];

export default function AnimalTrends() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [animals, setAnimals] = useState([]);
  const [animalId, setAnimalId] = useState('');
  const [testCode, setTestCode] = useState('CBC-FULL');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    animalsAPI.list({ limit: 200 }).then(({ data }) => setAnimals(data.data || [])).catch(() => {});
  }, []);

  const loadTrends = () => {
    if (!animalId) return;
    setLoading(true);
    animalsAPI.trends(animalId, { test_code: testCode })
      .then(({ data }) => setRows(data.data || []))
      .catch((err) => toast.error(err.response?.data?.error?.message || t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (animalId) loadTrends(); }, [animalId, testCode]);

  const byParameter = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = r.parameter_code;
      if (!map.has(key)) {
        map.set(key, {
          code: key,
          name: isAr ? (r.parameter_name_ar || r.parameter_name) : r.parameter_name,
          unit: r.unit,
          refMin: r.ref_min,
          refMax: r.ref_max,
          points: [],
        });
      }
      map.get(key).points.push({
        date: r.completed_date,
        value: r.numeric_value ?? r.value,
        sampleCode: r.sample_code,
        flag: r.flag,
      });
    });
    return [...map.values()];
  }, [rows, isAr]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={28} />
        <div>
          <h1 className="text-2xl font-bold">{isAr ? 'مقارنة نتائج الحيوان' : 'Animal Result Trends'}</h1>
          <p className="text-sm text-primary-500">{isAr ? 'تاريخ النتائج حسب الفحص' : 'Historical results by test'}</p>
        </div>
      </div>

      <div className="card p-4 mb-6 flex flex-wrap gap-3">
        <select className="input-field min-w-[220px]" value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
          <option value="">{isAr ? 'اختر الحيوان' : 'Select animal'}</option>
          {animals.map((a) => (
            <option key={a.id} value={a.id}>
              {a.animal_code} — {a.name_tag || ANIMAL_TYPES[a.animal_type]?.[isAr ? 'ar' : 'en']}
            </option>
          ))}
        </select>
        <select className="input-field w-48" value={testCode} onChange={(e) => setTestCode(e.target.value)}>
          {TEST_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>{isAr ? opt.labelAr : opt.labelEn}</option>
          ))}
        </select>
      </div>

      {loading ? <p>{t('common.loading')}</p> : (
        <div className="space-y-4">
          {byParameter.map((param) => (
            <div key={param.code} className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">{param.name} ({param.code})</h3>
                {(param.refMin != null || param.refMax != null) && (
                  <span className="text-xs text-primary-500">
                    Ref: {param.refMin ?? '—'} – {param.refMax ?? '—'} {param.unit || ''}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-start py-1">{isAr ? 'التاريخ' : 'Date'}</th>
                      <th className="text-start py-1">{isAr ? 'العينة' : 'Sample'}</th>
                      <th className="text-start py-1">{isAr ? 'النتيجة' : 'Value'}</th>
                      <th className="text-start py-1">{isAr ? 'الحالة' : 'Flag'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {param.points.map((p, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                        <td className="py-1">{p.sampleCode}</td>
                        <td className="py-1 font-medium">{p.value}</td>
                        <td className="py-1">{p.flag || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {!byParameter.length && animalId && (
            <p className="text-center text-gray-500 py-8">{isAr ? 'لا توجد نتائج سابقة' : 'No previous results'}</p>
          )}
        </div>
      )}
    </div>
  );
}
