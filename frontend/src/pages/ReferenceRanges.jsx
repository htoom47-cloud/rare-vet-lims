import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { referenceRangesAPI, testsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ANIMAL_TYPE_CODES, animalTypeLabel } from '../constants/animalTypes';
import { NORMA_CBC_PCT_BY_ABS } from '../constants/normaCbcPanel';

const PCT_LABEL = Object.fromEntries(
  Object.entries(NORMA_CBC_PCT_BY_ABS).map(([abs, pct]) => [pct, `${abs}%`])
);

const cbcRefParameterId = (p) => p.pct_parameter_id || p.id;

const cbcRefParameterLabel = (p, isAr) => {
  if (p.pct_code) {
    const sym = PCT_LABEL[p.pct_code] || p.pct_code.replace('_PCT', '%');
    return `${sym} — ${isAr ? (p.name_ar || p.norma_symbol) : (p.norma_symbol || p.name)}`;
  }
  return `${p.norma_symbol || p.code} — ${isAr ? (p.name_ar || p.name) : p.name}`;
};

const emptyForm = () => ({
  parameter_id: '', animal_type: 'camel', min_value: '', max_value: '',
  critical_low: '', critical_high: '', unit: '', text_reference: '', notes: '',
  sex: '', age_min: '', age_max: '', age_unit: 'year', device_id: '',
});

export default function ReferenceRanges() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const isAr = i18n.language === 'ar';
  const canManage = hasPermission('reference_ranges.manage');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [filters, setFilters] = useState({ species: '', test_id: '', search: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(() => {
    setLoading(true);
    referenceRangesAPI.list({
      species: filters.species || undefined,
      test_id: filters.test_id || undefined,
      search: filters.search || undefined,
      limit: 200,
    })
      .then(({ data }) => setRows(data.data?.rows || []))
      .catch((err) => toast.error(err.response?.data?.error?.message || t('common.error')))
      .finally(() => setLoading(false));
  }, [filters, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    testsAPI.list({ limit: 500 }).then(({ data }) => setTests(data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.parameter_id && !filters.test_id) { setParameters([]); return; }
    const testId = filters.test_id;
    if (!testId) return;
    testsAPI.get(testId).then(({ data }) => setParameters(data.data?.parameters || [])).catch(() => {});
  }, [filters.test_id, form.parameter_id]);

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setFormOpen(true); };
  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({
      parameter_id: row.parameter_id, animal_type: row.animal_type,
      min_value: row.min_value ?? '', max_value: row.max_value ?? '',
      critical_low: row.critical_low ?? '', critical_high: row.critical_high ?? '',
      unit: row.unit || '', text_reference: row.text_reference || '', notes: row.notes || '',
      sex: row.sex || '', age_min: row.age_min ?? '', age_max: row.age_max ?? '',
      age_unit: row.age_unit || 'year', device_id: row.device_id || '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.min_value !== '' && form.max_value !== '' && Number(form.min_value) > Number(form.max_value)) {
      toast.error(isAr ? 'الحد الأدنى أكبر من الأعلى' : 'Min cannot be greater than Max');
      return;
    }
    const payload = {
      ...form,
      min_value: form.min_value !== '' ? Number(form.min_value) : null,
      max_value: form.max_value !== '' ? Number(form.max_value) : null,
      critical_low: form.critical_low !== '' ? Number(form.critical_low) : null,
      critical_high: form.critical_high !== '' ? Number(form.critical_high) : null,
      age_min: form.age_min !== '' ? Number(form.age_min) : null,
      age_max: form.age_max !== '' ? Number(form.age_max) : null,
      sex: form.sex || null,
      device_id: form.device_id || null,
    };
    try {
      if (editingId) {
        await referenceRangesAPI.update(editingId, payload);
        toast.success(isAr ? 'تم التحديث' : 'Updated');
      } else {
        await referenceRangesAPI.create(payload);
        toast.success(isAr ? 'تمت الإضافة' : 'Added');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(isAr ? 'تعطيل هذا المدى المرجعي؟' : 'Deactivate this range?')) return;
    try {
      await referenceRangesAPI.delete(row.id);
      toast.success(isAr ? 'تم التعطيل' : 'Deactivated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const selectedTest = tests.find((tst) => tst.id === filters.test_id);
  const isCbcTest = selectedTest?.code === 'CBC-FULL';

  const parameterOptions = isCbcTest
    ? parameters.map((p) => ({ id: cbcRefParameterId(p), label: cbcRefParameterLabel(p, isAr), code: p.pct_code || p.code }))
    : parameters.map((p) => ({ id: p.id, label: `${p.code} — ${isAr ? (p.name_ar || p.name) : p.name}`, code: p.code }));

  const columns = [
    { key: 'test_code', label: isAr ? 'الفحص' : 'Test' },
    {
      key: 'parameter_code',
      label: isAr ? 'المعامل' : 'Parameter',
      render: (r) => {
        const label = r.parameter_display || r.parameter_code;
        if (r.parameter_misplaced) {
          return (
            <span className="text-amber-700" title={isAr ? 'النطاق على معامل العدد — يُعرض كـ % في النتائج' : 'Range on count param — results show as %'}>
              {label} ⚠
            </span>
          );
        }
        return label;
      },
    },
    { key: 'animal_type', label: isAr ? 'النوع' : 'Species', render: (r) => animalTypeLabel(r.animal_type, isAr) },
    { key: 'min_value', label: isAr ? 'Min' : 'Min' },
    { key: 'max_value', label: isAr ? 'Max' : 'Max' },
    { key: 'text_reference', label: isAr ? 'نص مرجعي' : 'Text ref', render: (r) => r.text_reference || '—' },
    ...(canManage ? [{
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => openEdit(r)} className="text-primary-600 text-sm flex items-center gap-1">
            <Pencil size={14} /> {t('common.edit')}
          </button>
          <button type="button" onClick={() => handleDelete(r)} className="text-red-600 text-sm flex items-center gap-1">
            <Trash2 size={14} /> {t('common.delete')}
          </button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{isAr ? 'إدارة القيم المرجعية' : 'Reference Ranges'}</h1>
          <p className="text-sm text-primary-500 mt-1">
            {isAr ? 'مدى مرجعي حسب النوع والفحص والمعامل — لا يُسحب من الجهاز' : 'Species/test/parameter ranges — LIMS is the source of truth'}
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {isAr ? 'إضافة' : 'Add'}
          </button>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <select className="input-field w-36" value={filters.species} onChange={(e) => setFilters({ ...filters, species: e.target.value })}>
          <option value="">{isAr ? 'كل الأنواع' : 'All species'}</option>
          {ANIMAL_TYPE_CODES.map((c) => <option key={c} value={c}>{animalTypeLabel(c, isAr)}</option>)}
        </select>
        <select className="input-field w-48" value={filters.test_id} onChange={(e) => setFilters({ ...filters, test_id: e.target.value })}>
          <option value="">{isAr ? 'كل الفحوصات' : 'All tests'}</option>
          {tests.map((tst) => <option key={tst.id} value={tst.id}>{tst.code} — {isAr ? tst.name_ar : tst.name}</option>)}
        </select>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-primary-400" />
          <input className="input-field ps-9 w-full" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="WBC..." />
        </div>
        <button type="button" onClick={load} className="btn-secondary">{t('common.filter')}</button>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} emptyMessage={isAr ? 'لا توجد قيم مرجعية' : 'No reference ranges'} />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editingId ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'إضافة' : 'Add')} size="md">
        <form onSubmit={handleSubmit} className="space-y-3">
          {!editingId && (
            <>
              <select className="input-field" value={filters.test_id} onChange={(e) => setFilters({ ...filters, test_id: e.target.value })} required>
                <option value="">{isAr ? 'اختر الفحص' : 'Select test'}</option>
                {tests.map((tst) => <option key={tst.id} value={tst.id}>{tst.code}</option>)}
              </select>
              <select className="input-field" value={form.parameter_id} onChange={(e) => setForm({ ...form, parameter_id: e.target.value })} required>
                <option value="">{isAr ? 'المعامل' : 'Parameter'}</option>
                {parameterOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {isCbcTest && (
                <p className="text-xs text-primary-500">
                  {isAr
                    ? 'تفاضل كريات الدم البيضاء: اختر LYM% / NEU% … وليس LYM / NEU (#)'
                    : 'WBC differential: use LYM% / NEU% … not absolute LYM / NEU (#)'}
                </p>
              )}
            </>
          )}
          <select className="input-field" value={form.animal_type} onChange={(e) => setForm({ ...form, animal_type: e.target.value })} required disabled={!!editingId}>
            {ANIMAL_TYPE_CODES.map((c) => <option key={c} value={c}>{animalTypeLabel(c, isAr)}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="any" placeholder="Min" className="input-field" value={form.min_value} onChange={(e) => setForm({ ...form, min_value: e.target.value })} />
            <input type="number" step="any" placeholder="Max" className="input-field" value={form.max_value} onChange={(e) => setForm({ ...form, max_value: e.target.value })} />
          </div>
          <input className="input-field" placeholder={isAr ? 'نص مرجعي (وصفي)' : 'Text reference'} value={form.text_reference} onChange={(e) => setForm({ ...form, text_reference: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'الوحدة' : 'Unit'} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
