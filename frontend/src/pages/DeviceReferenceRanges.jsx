import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import { devicesAPI } from '../services/api';
import { ANIMAL_TYPE_CODES, ANIMAL_TYPES, animalTypeLabel } from '../constants/animalTypes';

const SPECIES_OPTIONS = ANIMAL_TYPE_CODES.filter((c) => c !== 'other');

export default function DeviceReferenceRanges() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({
    device_name: 'Norma',
    species: '',
    search: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    devicesAPI.referenceRanges({
      device_name: filters.device_name || undefined,
      species: filters.species || undefined,
      search: filters.search || undefined,
      limit: 200,
    })
      .then(({ data }) => {
        setRows(data.data?.rows || []);
        setTotal(data.data?.total || 0);
      })
      .catch((err) => {
        toast.error(err.response?.data?.error?.message || t('common.error'));
      })
      .finally(() => setLoading(false));
  }, [filters, t]);

  useEffect(() => { load(); }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data } = await devicesAPI.syncReferenceRanges({ hours: 24 });
      const s = data.data;
      toast.success(
        isAr
          ? `تمت المزامنة: ${s.inserted} جديد، ${s.updated} محدّث`
          : `Synced: ${s.inserted} new, ${s.updated} updated`
      );
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  const speciesLabel = (code) => animalTypeLabel(code, isAr);

  const columns = [
    { key: 'device_name', label: isAr ? 'الجهاز' : 'Device' },
    { key: 'parameter_code', label: isAr ? 'الكود' : 'Code' },
    {
      key: 'parameter_name',
      label: isAr ? 'التحليل' : 'Parameter',
      render: (r) => (isAr ? r.lims_parameter_name_ar : r.lims_parameter_name) || r.parameter_name || r.parameter_code,
    },
    {
      key: 'species',
      label: isAr ? 'النوع' : 'Species',
      render: (r) => speciesLabel(r.species),
    },
    { key: 'unit', label: isAr ? 'الوحدة' : 'Unit', render: (r) => r.unit || '—' },
    {
      key: 'reference_text',
      label: isAr ? 'OBX-7 (Norma)' : 'OBX-7',
      render: (r) => r.reference_text || '—',
    },
    {
      key: 'low_value',
      label: isAr ? 'الحد الأدنى' : 'Low',
      render: (r) => (r.low_value != null ? Number(r.low_value) : '—'),
    },
    {
      key: 'high_value',
      label: isAr ? 'الحد الأعلى' : 'High',
      render: (r) => (r.high_value != null ? Number(r.high_value) : '—'),
    },
    { key: 'source', label: isAr ? 'المصدر' : 'Source' },
    {
      key: 'last_synced_at',
      label: isAr ? 'آخر تحديث' : 'Last sync',
      render: (r) => r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : '—',
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? 'معدلات الأجهزة الطبيعية' : 'Device Reference Ranges'}
          </h1>
          <p className="text-sm text-primary-500 mt-1">
            {isAr
              ? 'المعدلات المستوردة من Norma CBC — تُحدَّث تلقائياً عند كل استيراد ويومياً الساعة 2 صباحاً'
              : 'Ranges from Norma CBC — updated on each import and daily at 2 AM'}
          </p>
        </div>
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          {isAr ? 'مزامنة الآن' : 'Sync now'}
        </button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-primary-500 block mb-1">{isAr ? 'الجهاز' : 'Device'}</label>
          <input
            className="input-field w-40"
            value={filters.device_name}
            onChange={(e) => setFilters((f) => ({ ...f, device_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-primary-500 block mb-1">{isAr ? 'النوع' : 'Species'}</label>
          <select
            className="input-field w-36"
            value={filters.species}
            onChange={(e) => setFilters((f) => ({ ...f, species: e.target.value }))}
          >
            <option value="">{isAr ? 'الكل' : 'All'}</option>
            {SPECIES_OPTIONS.map((code) => (
              <option key={code} value={code}>{animalTypeLabel(code, isAr)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-primary-500 block mb-1">{isAr ? 'بحث' : 'Search'}</label>
          <div className="relative">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-primary-400" />
            <input
              className="input-field ps-9 w-full"
              placeholder="WBC, HGB..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
        </div>
        <button type="button" onClick={load} className="btn-secondary">
          {t('common.filter')}
        </button>
      </div>

      <p className="text-sm text-primary-500 mb-2">
        {total}
        {' '}
        {isAr ? 'سجل' : 'records'}
      </p>

      <DataTable columns={columns} data={rows} loading={loading} emptyMessage={isAr ? 'لا توجد معدلات بعد — أرسل CBC من Norma' : 'No ranges yet — send CBC from Norma'} />
    </div>
  );
}
