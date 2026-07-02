import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { devicesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ANIMAL_TYPE_CODES, animalTypeLabel } from '../constants/animalTypes';

const SPECIES_OPTIONS = ANIMAL_TYPE_CODES.filter((c) => c !== 'other');

const emptyForm = () => ({
  device_name: 'Norma CBC',
  parameter_code: '',
  parameter_name: '',
  species: 'camel',
  unit: '',
  low_value: '',
  high_value: '',
  reference_text: '',
});

export default function DeviceReferenceRanges() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const isAr = i18n.language === 'ar';
  const canManage = hasPermission('devices.manage');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [filters, setFilters] = useState({
    device_name: '',
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

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      device_name: row.device_name || 'Norma CBC',
      parameter_code: row.parameter_code || '',
      parameter_name: row.parameter_name || '',
      species: row.species || 'camel',
      unit: row.unit || '',
      low_value: row.low_value ?? '',
      high_value: row.high_value ?? '',
      reference_text: row.reference_text || '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      low_value: form.low_value !== '' ? Number(form.low_value) : null,
      high_value: form.high_value !== '' ? Number(form.high_value) : null,
    };
    try {
      if (editingId) {
        await devicesAPI.updateReferenceRange(editingId, payload);
        toast.success(t('deviceRefRanges.updated'));
      } else {
        await devicesAPI.createReferenceRange(payload);
        toast.success(t('deviceRefRanges.created'));
      }
      closeForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
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
      label: isAr ? 'المدى المرجعي' : 'Ref. Range',
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
    ...(canManage ? [{
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <button
          type="button"
          onClick={() => openEdit(r)}
          className="text-primary-600 text-sm flex items-center gap-1"
        >
          <Pencil size={14} /> {t('common.edit')}
        </button>
      ),
    }] : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.deviceRefRanges')}</h1>
          <p className="text-sm text-primary-500 mt-1">{t('deviceRefRanges.subtitle')}</p>
        </div>
        {canManage && (
          <button type="button" onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            {t('deviceRefRanges.add')}
          </button>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-primary-500 block mb-1">{isAr ? 'الجهاز' : 'Device'}</label>
          <input
            className="input-field w-40"
            value={filters.device_name}
            onChange={(e) => setFilters((f) => ({ ...f, device_name: e.target.value }))}
            placeholder={isAr ? 'الكل' : 'All'}
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

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyMessage={t('deviceRefRanges.empty')}
      />

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editingId ? t('deviceRefRanges.edit') : t('deviceRefRanges.add')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{isAr ? 'الجهاز' : 'Device'}</label>
            <input
              value={form.device_name}
              onChange={(e) => setForm({ ...form, device_name: e.target.value })}
              className="input-field"
              required
              disabled={!!editingId}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{isAr ? 'كود المعامل' : 'Parameter code'}</label>
              <input
                value={form.parameter_code}
                onChange={(e) => setForm({ ...form, parameter_code: e.target.value })}
                className="input-field"
                required
                disabled={!!editingId}
                placeholder="WBC"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{isAr ? 'اسم المعامل' : 'Parameter name'}</label>
              <input
                value={form.parameter_name}
                onChange={(e) => setForm({ ...form, parameter_name: e.target.value })}
                className="input-field"
                placeholder="White Blood Cells"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{isAr ? 'النوع' : 'Species'}</label>
              <select
                value={form.species}
                onChange={(e) => setForm({ ...form, species: e.target.value })}
                className="input-field"
                required
                disabled={!!editingId}
              >
                {SPECIES_OPTIONS.map((code) => (
                  <option key={code} value={code}>{animalTypeLabel(code, isAr)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{isAr ? 'الوحدة' : 'Unit'}</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input-field"
                placeholder="10^3/uL"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{isAr ? 'الحد الأدنى' : 'Low'}</label>
              <input
                type="number"
                step="any"
                value={form.low_value}
                onChange={(e) => setForm({ ...form, low_value: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{isAr ? 'الحد الأعلى' : 'High'}</label>
              <input
                type="number"
                step="any"
                value={form.high_value}
                onChange={(e) => setForm({ ...form, high_value: e.target.value })}
                className="input-field"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{isAr ? 'نص المدى المرجعي' : 'Reference text'}</label>
            <input
              value={form.reference_text}
              onChange={(e) => setForm({ ...form, reference_text: e.target.value })}
              className="input-field"
              placeholder="6.0-17.0"
            />
            <p className="text-xs text-gray-500 mt-1">{t('deviceRefRanges.refTextHint')}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={closeForm} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
