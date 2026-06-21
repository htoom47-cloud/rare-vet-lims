import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Eye, Pencil, FlaskConical, ListPlus, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { testsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getCategoryEmoji } from '../utils/testCategoryIcons';

const ANIMAL_TYPES = ['camel', 'horse', 'sheep', 'goat', 'bird', 'cat', 'dog'];

const emptyTestForm = () => ({
  code: '', name: '', name_ar: '', category_id: '', description: '', price: 0,
  turnaround_hours: 24, unit: '', method: '', label_copies: 1,
});

const emptyParamForm = () => ({
  code: '', name: '', name_ar: '', unit: '', sort_order: 0, is_calculated: false, formula: '', decimal_places: 2,
});

const emptyRangeForm = () => ({
  animal_type: 'camel', min_value: '', max_value: '', critical_low: '', critical_high: '', unit: '', notes: '',
});

export default function Tests() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('tests.manage');

  const [tests, setTests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTestForm());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [paramOpen, setParamOpen] = useState(false);
  const [paramForm, setParamForm] = useState(emptyParamForm());

  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeParam, setRangeParam] = useState(null);
  const [rangeForm, setRangeForm] = useState(emptyRangeForm());

  const displayName = (item) => (i18n.language === 'ar' && item?.name_ar ? item.name_ar : item?.name);
  const catLabel = (cat) => (i18n.language === 'ar' && cat?.name_ar ? cat.name_ar : cat?.name);

  const load = () => {
    setLoading(true);
    const params = {};
    if (categoryFilter) params.category_id = categoryFilter;
    if (search.trim()) params.search = search.trim();
    testsAPI.list(params)
      .then(({ data }) => setTests(data.data))
      .finally(() => setLoading(false));
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data } = await testsAPI.get(id);
      setDetail(data.data);
    } catch {
      toast.error('خطأ في تحميل التفاصيل');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    testsAPI.categories().then(({ data }) => setCategories(data.data));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [categoryFilter, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyTestForm());
    setFormOpen(true);
  };

  const openEdit = (test) => {
    setEditingId(test.id);
    setForm({
      code: test.code || '',
      name: test.name || '',
      name_ar: test.name_ar || '',
      category_id: String(test.category_id || ''),
      description: test.description || '',
      price: test.price ?? 0,
      turnaround_hours: test.turnaround_hours ?? 24,
      unit: test.unit || '',
      method: test.method || '',
      label_copies: test.label_copies ?? 1,
    });
    setFormOpen(true);
  };

  const openDetail = async (test) => {
    setDetailOpen(true);
    setDetail(null);
    await loadDetail(test.id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      category_id: Number(form.category_id),
      price: Number(form.price),
      turnaround_hours: Number(form.turnaround_hours),
      label_copies: Number(form.label_copies) || 1,
    };
    try {
      if (editingId) {
        await testsAPI.update(editingId, payload);
        toast.success(t('tests.updated'));
        if (detailOpen && detail?.id === editingId) await loadDetail(editingId);
      } else {
        await testsAPI.create(payload);
        toast.success(t('tests.created'));
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const handleAddParameter = async (e) => {
    e.preventDefault();
    if (!detail?.id) return;
    try {
      await testsAPI.addParameter(detail.id, {
        ...paramForm,
        sort_order: Number(paramForm.sort_order),
        decimal_places: Number(paramForm.decimal_places),
        formula: paramForm.is_calculated ? paramForm.formula : null,
      });
      toast.success(t('tests.paramAdded'));
      setParamOpen(false);
      setParamForm(emptyParamForm());
      await loadDetail(detail.id);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const handleAddRange = async (e) => {
    e.preventDefault();
    if (!rangeParam?.id) return;
    try {
      await testsAPI.addReferenceRange(rangeParam.id, {
        ...rangeForm,
        min_value: rangeForm.min_value !== '' ? Number(rangeForm.min_value) : null,
        max_value: rangeForm.max_value !== '' ? Number(rangeForm.max_value) : null,
        critical_low: rangeForm.critical_low !== '' ? Number(rangeForm.critical_low) : null,
        critical_high: rangeForm.critical_high !== '' ? Number(rangeForm.critical_high) : null,
      });
      toast.success(t('tests.rangeAdded'));
      setRangeOpen(false);
      setRangeForm(emptyRangeForm());
      await loadDetail(detail.id);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const rangesForParam = (paramId) => detail?.reference_ranges?.filter((r) => r.parameter_id === paramId) || [];

  const columns = [
    { key: 'code', label: t('tests.code') },
    {
      key: 'name',
      label: t('common.name'),
      render: (r) => (
        <div>
          <p className="font-medium">{displayName(r)}</p>
          {r.name_ar && i18n.language !== 'ar' && <p className="text-xs text-gray-500">{r.name_ar}</p>}
        </div>
      ),
    },
    {
      key: 'category_name',
      label: t('tests.category'),
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-base leading-none" aria-hidden="true">{getCategoryEmoji(r)}</span>
          {r.category_name || '—'}
        </span>
      ),
    },
    { key: 'price', label: t('tests.price'), render: (r) => `${Number(r.price).toFixed(2)} SAR` },
    { key: 'turnaround_hours', label: t('tests.turnaround') },
    { key: 'label_copies', label: t('tests.labelCopies'), render: (r) => r.label_copies ?? 1 },
    { key: 'unit', label: t('tests.unit'), render: (r) => r.unit || '—' },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => openDetail(r)} className="text-primary-600 text-sm flex items-center gap-1">
            <Eye size={14} /> {t('common.view')}
          </button>
          {canManage && (
            <button onClick={() => openEdit(r)} className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-1">
              <Pencil size={14} /> {t('common.edit')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('tests.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{tests.length} {t('nav.tests').toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:min-w-[220px]">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tests.searchPlaceholder')}
              className="input-field ps-9"
            />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input-field w-auto">
            <option value="">{t('tests.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {getCategoryEmoji(c)} {catLabel(c)}
              </option>
            ))}
          </select>
          {canManage && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> {t('common.add')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <button
          type="button"
          onClick={() => setCategoryFilter('')}
          className={`card p-4 text-center transition border-2 ${!categoryFilter ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-transparent hover:border-primary-300'}`}
        >
          <FlaskConical size={20} className="mx-auto mb-1 text-primary-600" />
          <p className="font-semibold text-sm">{t('tests.allCategories')}</p>
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(String(cat.id))}
            className={`card p-4 text-center transition border-2 ${categoryFilter === String(cat.id) ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-transparent hover:border-primary-300'}`}
          >
            <span className="text-2xl mb-1 leading-none" aria-hidden="true">{getCategoryEmoji(cat)}</span>
            <p className="font-semibold text-sm">{catLabel(cat)}</p>
            <p className="text-xs text-gray-500">{cat.department}</p>
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={tests} loading={loading} onRowClick={openDetail} />

      {/* إنشاء / تعديل فحص */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? t('tests.editTest') : t('tests.newTest')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'code', label: t('tests.code'), required: true },
            { key: 'name', label: t('tests.nameEn'), required: true },
            { key: 'name_ar', label: t('tests.nameAr') },
            { key: 'unit', label: t('tests.unit') },
            { key: 'method', label: t('tests.method') },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="input-field"
                required={f.required}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">{t('tests.description')}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.category')}</label>
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="input-field" required>
              <option value="">—</option>
              {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {getCategoryEmoji(c)} {catLabel(c)}
              </option>
            ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.price')} (SAR)</label>
            <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.turnaround')}</label>
            <input type="number" min="1" value={form.turnaround_hours} onChange={(e) => setForm({ ...form, turnaround_hours: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.labelCopies')}</label>
            <input
              type="number"
              min="1"
              max="20"
              value={form.label_copies}
              onChange={(e) => setForm({ ...form, label_copies: e.target.value })}
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">{t('tests.labelCopiesHint')}</p>
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      {/* تفاصيل الفحص */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={t('tests.testDetails')} size="xl">
        {detailLoading ? (
          <p className="text-center py-8 text-gray-500">{t('common.loading')}</p>
        ) : detail ? (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-xl leading-none" aria-hidden="true">{getCategoryEmoji(detail)}</span>
                  {displayName(detail)}
                </h3>
                <p className="text-sm text-gray-500">{detail.code} · {detail.category_name}</p>
              </div>
              {canManage && (
                <button onClick={() => openEdit(detail)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Pencil size={16} /> {t('common.edit')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('tests.price'), value: `${Number(detail.price).toFixed(2)} SAR` },
                { label: t('tests.turnaround'), value: `${detail.turnaround_hours}h` },
                { label: t('tests.labelCopies'), value: detail.label_copies ?? 1 },
                { label: t('tests.unit'), value: detail.unit || '—' },
                { label: t('tests.method'), value: detail.method || '—' },
              ].map((item) => (
                <div key={item.label} className="card p-3">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className="font-semibold">{item.value}</p>
                </div>
              ))}
            </div>

            {detail.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">{detail.description}</p>
            )}

            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <BarChart3 size={18} /> {t('tests.parameters')} ({detail.parameters?.length || 0})
                </h4>
                {canManage && (
                  <button onClick={() => { setParamForm(emptyParamForm()); setParamOpen(true); }} className="btn-primary text-sm flex items-center gap-1">
                    <ListPlus size={16} /> {t('tests.addParameter')}
                  </button>
                )}
              </div>

              {!detail.parameters?.length ? (
                <p className="text-center text-gray-500 py-6 card">{t('tests.noParameters')}</p>
              ) : (
                <div className="space-y-4">
                  {detail.parameters.map((param) => (
                    <div key={param.id} className="card p-4">
                      <div className="flex flex-wrap justify-between gap-2 mb-3">
                        <div>
                          <p className="font-medium">{i18n.language === 'ar' && param.name_ar ? param.name_ar : param.name}</p>
                          <p className="text-xs text-gray-500">{param.code} · {param.unit || '—'}</p>
                        </div>
                        {canManage && (
                          <button
                            onClick={() => {
                              setRangeParam(param);
                              setRangeForm({ ...emptyRangeForm(), unit: param.unit || '' });
                              setRangeOpen(true);
                            }}
                            className="text-primary-600 text-sm"
                          >
                            + {t('tests.addRange')}
                          </button>
                        )}
                      </div>
                      {rangesForParam(param.id).length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-500 border-b dark:border-gray-700">
                                <th className="text-start py-1">{t('tests.animalType')}</th>
                                <th className="text-start py-1">{t('tests.minValue')}</th>
                                <th className="text-start py-1">{t('tests.maxValue')}</th>
                                <th className="text-start py-1">{t('tests.criticalLow')}</th>
                                <th className="text-start py-1">{t('tests.criticalHigh')}</th>
                                <th className="text-start py-1">{t('tests.unit')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rangesForParam(param.id).map((range) => (
                                <tr key={range.id} className="border-b dark:border-gray-700/50">
                                  <td className="py-1.5">{t(`animals.types.${range.animal_type}`)}</td>
                                  <td className="py-1.5">{range.min_value ?? '—'}</td>
                                  <td className="py-1.5">{range.max_value ?? '—'}</td>
                                  <td className="py-1.5 text-amber-600">{range.critical_low ?? '—'}</td>
                                  <td className="py-1.5 text-red-600">{range.critical_high ?? '—'}</td>
                                  <td className="py-1.5">{range.unit || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">{t('tests.noParameters')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* إضافة معامل */}
      <Modal isOpen={paramOpen} onClose={() => setParamOpen(false)} title={t('tests.addParameter')} size="md">
        <form onSubmit={handleAddParameter} className="space-y-4">
          {[
            { key: 'code', label: t('tests.paramCode'), required: true },
            { key: 'name', label: t('tests.nameEn'), required: true },
            { key: 'name_ar', label: t('tests.nameAr') },
            { key: 'unit', label: t('tests.unit') },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                value={paramForm[f.key]}
                onChange={(e) => setParamForm({ ...paramForm, [f.key]: e.target.value })}
                className="input-field"
                required={f.required}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ترتيب العرض</label>
              <input type="number" min="0" value={paramForm.sort_order} onChange={(e) => setParamForm({ ...paramForm, sort_order: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">الخانات العشرية</label>
              <input type="number" min="0" max="6" value={paramForm.decimal_places} onChange={(e) => setParamForm({ ...paramForm, decimal_places: e.target.value })} className="input-field" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paramForm.is_calculated} onChange={(e) => setParamForm({ ...paramForm, is_calculated: e.target.checked })} />
            معامل محسوب (بمعادلة)
          </label>
          {paramForm.is_calculated && (
            <div>
              <label className="block text-sm font-medium mb-1">المعادلة</label>
              <input value={paramForm.formula} onChange={(e) => setParamForm({ ...paramForm, formula: e.target.value })} className="input-field" placeholder="e.g. HGB / RBC" />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setParamOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      {/* إضافة مدى مرجعي */}
      <Modal isOpen={rangeOpen} onClose={() => setRangeOpen(false)} title={t('tests.addRange')} size="md">
        <form onSubmit={handleAddRange} className="space-y-4">
          <p className="text-sm text-gray-500">
            {rangeParam && (i18n.language === 'ar' && rangeParam.name_ar ? rangeParam.name_ar : rangeParam.name)}
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.animalType')}</label>
            <select value={rangeForm.animal_type} onChange={(e) => setRangeForm({ ...rangeForm, animal_type: e.target.value })} className="input-field" required>
              {ANIMAL_TYPES.map((type) => (
                <option key={type} value={type}>{t(`animals.types.${type}`)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'min_value', label: t('tests.minValue') },
              { key: 'max_value', label: t('tests.maxValue') },
              { key: 'critical_low', label: t('tests.criticalLow') },
              { key: 'critical_high', label: t('tests.criticalHigh') },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1">{f.label}</label>
                <input type="number" step="any" value={rangeForm[f.key]} onChange={(e) => setRangeForm({ ...rangeForm, [f.key]: e.target.value })} className="input-field" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.unit')}</label>
            <input value={rangeForm.unit} onChange={(e) => setRangeForm({ ...rangeForm, unit: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
            <input value={rangeForm.notes} onChange={(e) => setRangeForm({ ...rangeForm, notes: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setRangeOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
