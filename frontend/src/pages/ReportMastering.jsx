import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Search, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { reportMasteringAPI, testsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const VALUE_TYPES = ['numeric', 'percentage', 'count', 'text', 'qual'];

const emptyParamForm = () => ({
  name: '', name_ar: '', unit: '', device_code: '', short_code: '',
  sort_order: 0, show_in_report: true, value_type: 'numeric', category: '',
});

const emptyMappingForm = () => ({
  device_name: 'Norma CBC', device_parameter_code: '', system_parameter_id: '',
  display_name_ar: '', display_name_en: '', unit: '', value_type: 'numeric', sort_order: 0,
});

export default function ReportMastering() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const isAr = i18n.language === 'ar';
  const canManage = hasPermission('reference_ranges.manage');

  const [tab, setTab] = useState('parameters');
  const [parameters, setParameters] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [quality, setQuality] = useState(null);
  const [tests, setTests] = useState([]);
  const [testParams, setTestParams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [testFilter, setTestFilter] = useState('');
  const [paramFormOpen, setParamFormOpen] = useState(false);
  const [mappingFormOpen, setMappingFormOpen] = useState(false);
  const [editingParam, setEditingParam] = useState(null);
  const [paramForm, setParamForm] = useState(emptyParamForm());
  const [mappingForm, setMappingForm] = useState(emptyMappingForm());

  const loadParameters = useCallback(() => {
    setLoading(true);
    reportMasteringAPI.listParameters({
      test_id: testFilter || undefined,
      search: search || undefined,
      include_hidden: true,
      limit: 300,
    })
      .then(({ data }) => setParameters(data.data?.rows || []))
      .catch((err) => toast.error(err.response?.data?.error?.message || t('common.error')))
      .finally(() => setLoading(false));
  }, [search, testFilter, t]);

  const loadMappings = useCallback(() => {
    setLoading(true);
    reportMasteringAPI.listMappings({ search: search || undefined, limit: 300 })
      .then(({ data }) => setMappings(data.data?.rows || []))
      .catch((err) => toast.error(err.response?.data?.error?.message || t('common.error')))
      .finally(() => setLoading(false));
  }, [search, t]);

  const loadQuality = useCallback(() => {
    setLoading(true);
    reportMasteringAPI.qualityAudit({ test_id: testFilter || undefined })
      .then(({ data }) => setQuality(data.data))
      .catch((err) => toast.error(err.response?.data?.error?.message || t('common.error')))
      .finally(() => setLoading(false));
  }, [testFilter, t]);

  useEffect(() => {
    testsAPI.list({ limit: 500 }).then(({ data }) => setTests(data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!testFilter) { setTestParams([]); return; }
    testsAPI.get(testFilter).then(({ data }) => setTestParams(data.data?.parameters || [])).catch(() => {});
  }, [testFilter]);

  useEffect(() => {
    if (tab === 'parameters') loadParameters();
    else if (tab === 'mappings') loadMappings();
    else loadQuality();
  }, [tab, loadParameters, loadMappings, loadQuality]);

  const openEditParam = (row) => {
    setEditingParam(row.id);
    setParamForm({
      name: row.name || '',
      name_ar: row.name_ar || '',
      unit: row.unit || '',
      device_code: row.mapped_device_code || row.device_code || '',
      short_code: row.short_code || '',
      sort_order: row.sort_order ?? 0,
      show_in_report: row.show_in_report !== false,
      value_type: row.value_type || 'numeric',
      category: row.category || '',
    });
    setParamFormOpen(true);
  };

  const saveParam = async (e) => {
    e.preventDefault();
    try {
      await reportMasteringAPI.updateParameter(editingParam, {
        ...paramForm,
        sort_order: Number(paramForm.sort_order) || 0,
      });
      toast.success(isAr ? 'تم الحفظ' : 'Saved');
      setParamFormOpen(false);
      loadParameters();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const saveMapping = async (e) => {
    e.preventDefault();
    try {
      await reportMasteringAPI.upsertMapping({
        ...mappingForm,
        sort_order: Number(mappingForm.sort_order) || 0,
      });
      toast.success(isAr ? 'تم الحفظ' : 'Saved');
      setMappingFormOpen(false);
      loadMappings();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const deactivateMapping = async (row) => {
    if (!window.confirm(isAr ? 'تعطيل الربط؟' : 'Deactivate mapping?')) return;
    try {
      await reportMasteringAPI.deactivateMapping(row.id);
      toast.success(isAr ? 'تم التعطيل' : 'Deactivated');
      loadMappings();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  if (!canManage) {
    return <p className="p-6 text-sm text-red-600">{isAr ? 'غير مصرح' : 'Not authorized'}</p>;
  }

  const paramColumns = [
    { key: 'test_code', label: isAr ? 'الفحص' : 'Test' },
    { key: 'code', label: isAr ? 'رمز النظام' : 'System code' },
    { key: 'device_code', label: isAr ? 'رمز الجهاز' : 'Device code', render: (r) => r.mapped_device_code || r.device_code || '—' },
    { key: 'name_ar', label: isAr ? 'الاسم العربي' : 'Arabic name' },
    { key: 'name', label: isAr ? 'الاسم الإنجليزي' : 'English name' },
    { key: 'unit', label: isAr ? 'الوحدة' : 'Unit' },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <button type="button" onClick={() => openEditParam(r)} className="text-primary-600 text-sm flex items-center gap-1">
          <Pencil size={14} /> {t('common.edit')}
        </button>
      ),
    },
  ];

  const mappingColumns = [
    { key: 'device_name', label: isAr ? 'الجهاز' : 'Device' },
    { key: 'device_parameter_code', label: isAr ? 'رمز الجهاز' : 'Device code' },
    { key: 'system_parameter_code', label: isAr ? 'رمز النظام' : 'System code' },
    { key: 'display_name_ar', label: isAr ? 'عربي' : 'Arabic' },
    { key: 'display_name_en', label: isAr ? 'إنجليزي' : 'English' },
    { key: 'unit', label: isAr ? 'الوحدة' : 'Unit' },
    { key: 'value_type', label: isAr ? 'النوع' : 'Type' },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <button type="button" onClick={() => deactivateMapping(r)} className="text-red-600 text-sm flex items-center gap-1">
          <Trash2 size={14} /> {t('common.delete')}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{isAr ? 'إتقان التقرير والمراجع' : 'Report & Reference Mastering'}</h1>
        <p className="text-sm text-primary-500 mt-1">
          {isAr ? 'ترجمة المعاملات، ربط الجهاز، وجودة المدى المرجعي' : 'Parameter names, device mapping, reference quality'}
        </p>
      </div>

      <div className="flex gap-2 mb-4 border-b border-primary-200">
        {['parameters', 'mappings', 'quality'].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-primary-400'}`}
          >
            {key === 'parameters' && (isAr ? 'المعاملات' : 'Parameters')}
            {key === 'mappings' && (isAr ? 'ربط الجهاز' : 'Device Mapping')}
            {key === 'quality' && (isAr ? 'جودة المراجع' : 'Quality Audit')}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        {(tab === 'parameters' || tab === 'quality') && (
          <select className="input-field w-48" value={testFilter} onChange={(e) => setTestFilter(e.target.value)}>
            <option value="">{isAr ? 'كل الفحوصات' : 'All tests'}</option>
            {tests.map((tst) => <option key={tst.id} value={tst.id}>{tst.code}</option>)}
          </select>
        )}
        {tab !== 'quality' && (
          <div className="relative flex-1 min-w-[160px]">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-primary-400" />
            <input className="input-field ps-9 w-full" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="WBC, LYM%..." />
          </div>
        )}
        {tab === 'mappings' && (
          <button type="button" onClick={() => { setMappingForm(emptyMappingForm()); setMappingFormOpen(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> {isAr ? 'إضافة ربط' : 'Add mapping'}
          </button>
        )}
        <button type="button" onClick={() => (tab === 'parameters' ? loadParameters() : tab === 'mappings' ? loadMappings() : loadQuality())} className="btn-secondary">
          {t('common.filter')}
        </button>
      </div>

      {tab === 'parameters' && (
        <DataTable columns={paramColumns} data={parameters} loading={loading} emptyMessage={isAr ? 'لا معاملات' : 'No parameters'} />
      )}

      {tab === 'mappings' && (
        <DataTable columns={mappingColumns} data={mappings} loading={loading} emptyMessage={isAr ? 'لا ربط' : 'No mappings'} />
      )}

      {tab === 'quality' && quality && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(quality.summary || {}).map(([k, v]) => (
              <div key={k} className="card p-3">
                <p className="text-xs text-primary-500">{k}</p>
                <p className="text-2xl font-bold flex items-center gap-2">
                  {v}
                  {v > 0 && <AlertTriangle size={16} className="text-amber-600" />}
                </p>
              </div>
            ))}
          </div>
          {quality.invertedRanges?.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold mb-2">{isAr ? 'مدى مقلوب (Min > Max)' : 'Inverted ranges (Min > Max)'}</h3>
              <ul className="text-sm space-y-1">
                {quality.invertedRanges.slice(0, 20).map((r) => (
                  <li key={r.id}>{r.test_code} / {r.parameter_code} ({r.animal_type}): {r.min_value} – {r.max_value}</li>
                ))}
              </ul>
            </div>
          )}
          {quality.missingArabic?.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold mb-2">{isAr ? 'بدون ترجمة عربية' : 'Missing Arabic names'}</h3>
              <p className="text-sm">{quality.missingArabic.slice(0, 15).map((r) => r.code).join(', ')}</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={paramFormOpen} onClose={() => setParamFormOpen(false)} title={isAr ? 'تعديل المعامل' : 'Edit parameter'} size="md">
        <form onSubmit={saveParam} className="space-y-3">
          <input className="input-field" placeholder={isAr ? 'الاسم العربي' : 'Arabic name'} value={paramForm.name_ar} onChange={(e) => setParamForm({ ...paramForm, name_ar: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'الاسم الإنجليزي' : 'English name'} value={paramForm.name} onChange={(e) => setParamForm({ ...paramForm, name: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'رمز الجهاز' : 'Device code'} value={paramForm.device_code} onChange={(e) => setParamForm({ ...paramForm, device_code: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'رمز مختصر' : 'Short code'} value={paramForm.short_code} onChange={(e) => setParamForm({ ...paramForm, short_code: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'الوحدة' : 'Unit'} value={paramForm.unit} onChange={(e) => setParamForm({ ...paramForm, unit: e.target.value })} />
          <select className="input-field" value={paramForm.value_type} onChange={(e) => setParamForm({ ...paramForm, value_type: e.target.value })}>
            {VALUE_TYPES.map((vt) => <option key={vt} value={vt}>{vt}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paramForm.show_in_report} onChange={(e) => setParamForm({ ...paramForm, show_in_report: e.target.checked })} />
            {isAr ? 'يظهر في التقرير' : 'Show in report'}
          </label>
          <button type="submit" className="btn-primary w-full">{t('common.save')}</button>
        </form>
      </Modal>

      <Modal isOpen={mappingFormOpen} onClose={() => setMappingFormOpen(false)} title={isAr ? 'ربط جهاز' : 'Device mapping'} size="md">
        <form onSubmit={saveMapping} className="space-y-3">
          <input className="input-field" placeholder={isAr ? 'اسم الجهاز' : 'Device name'} value={mappingForm.device_name} onChange={(e) => setMappingForm({ ...mappingForm, device_name: e.target.value })} required />
          <input className="input-field" placeholder={isAr ? 'رمز الجهاز (مثل LYM%)' : 'Device code (e.g. LYM%)'} value={mappingForm.device_parameter_code} onChange={(e) => setMappingForm({ ...mappingForm, device_parameter_code: e.target.value })} required />
          <select className="input-field" value={testFilter} onChange={(e) => setTestFilter(e.target.value)} required>
            <option value="">{isAr ? 'اختر الفحص' : 'Select test'}</option>
            {tests.map((tst) => <option key={tst.id} value={tst.id}>{tst.code}</option>)}
          </select>
          <select className="input-field" value={mappingForm.system_parameter_id} onChange={(e) => setMappingForm({ ...mappingForm, system_parameter_id: e.target.value })} required>
            <option value="">{isAr ? 'معامل النظام' : 'System parameter'}</option>
            {testParams.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <input className="input-field" placeholder={isAr ? 'الاسم العربي' : 'Arabic name'} value={mappingForm.display_name_ar} onChange={(e) => setMappingForm({ ...mappingForm, display_name_ar: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'الاسم الإنجليزي' : 'English name'} value={mappingForm.display_name_en} onChange={(e) => setMappingForm({ ...mappingForm, display_name_en: e.target.value })} />
          <input className="input-field" placeholder={isAr ? 'الوحدة' : 'Unit'} value={mappingForm.unit} onChange={(e) => setMappingForm({ ...mappingForm, unit: e.target.value })} />
          <select className="input-field" value={mappingForm.value_type} onChange={(e) => setMappingForm({ ...mappingForm, value_type: e.target.value })}>
            {VALUE_TYPES.map((vt) => <option key={vt} value={vt}>{vt}</option>)}
          </select>
          <button type="submit" className="btn-primary w-full">{t('common.save')}</button>
        </form>
      </Modal>
    </div>
  );
}
