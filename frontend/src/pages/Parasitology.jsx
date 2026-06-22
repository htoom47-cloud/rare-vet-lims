import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Camera, Droplets, Trash2, Pencil, Plus, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import { samplesAPI, resultsAPI, testsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PARAS_BLOOD = 'PARAS-BLOOD';
const PARAS_STOOL = 'PARAS-STOOL';
const PARAS_TEST_CODES = new Set([PARAS_BLOOD, PARAS_STOOL]);

const emptyParasiteForm = () => ({
  code: '', name: '', name_ar: '', unit: 'qual', sort_order: 0,
});

function QualToggle({ value, onChange, labels }) {
  return (
    <div className="flex gap-1 mt-1">
      {[
        { v: '', label: labels.notSet, cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500' },
        { v: 'Negative', label: labels.negative, cls: 'data-[on=true]:bg-green-600 data-[on=true]:text-white' },
        { v: 'Positive', label: labels.positive, cls: 'data-[on=true]:bg-red-600 data-[on=true]:text-white' },
      ].map((opt) => (
        <button
          key={opt.v || 'empty'}
          type="button"
          data-on={value === opt.v}
          onClick={() => onChange(opt.v)}
          className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border border-primary-200 dark:border-primary-700 transition ${opt.cls} ${value === opt.v ? (opt.v === 'Negative' ? 'bg-green-600 text-white' : opt.v === 'Positive' ? 'bg-red-600 text-white' : opt.cls) : 'hover:bg-primary-50 dark:hover:bg-primary-900/30'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ParasiteTypeList({ title, icon: Icon, testMeta, params, canManage, onAdd, onEdit, onDelete, displayName, addLabel }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <Icon size={16} className="text-primary-600" />
          {title}
        </h4>
        {canManage && testMeta && (
          <button type="button" onClick={() => onAdd(testMeta)} className="text-primary-600 text-xs flex items-center gap-1">
            <Plus size={14} /> {addLabel}
          </button>
        )}
      </div>
      {!testMeta ? (
        <p className="text-xs text-gray-500">—</p>
      ) : (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto">
          {params.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-primary-50/60 dark:bg-primary-900/20 text-sm"
            >
              <span>{displayName(p)}</span>
              {canManage && p.code !== 'NOTES' && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => onEdit(p)} className="p-1 text-primary-600 hover:bg-primary-100 rounded">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => onDelete(p)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ParasiteSection({ title, icon: Icon, test, fields, onChange, labels, emptyHint }) {
  if (!test) {
    return (
      <div className="card p-6 text-center text-gray-500">
        <Icon className="mx-auto mb-2 opacity-40" size={32} />
        <p className="text-sm">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-semibold flex items-center gap-2 mb-4 pb-3 border-b border-primary-200 dark:border-primary-700">
        <Icon size={20} className="text-primary-600" />
        {title}
      </h3>
      <div className="space-y-3">
        {fields.map((param, idx) => (
          <div key={param.parameter_id} className="p-3 rounded-lg bg-primary-50/50 dark:bg-primary-900/20">
            <label className="text-sm font-medium block">
              {param.displayName}
            </label>
            {param.unit === 'qual' ? (
              <QualToggle
                value={param.value}
                onChange={(v) => onChange(test.id, idx, v)}
                labels={labels}
              />
            ) : (
              <textarea
                value={param.value}
                onChange={(e) => onChange(test.id, idx, e.target.value)}
                className="input-field mt-1 min-h-[60px]"
                placeholder={labels.notes}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Parasitology() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('tests.manage');
  const fileRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSample, setSelectedSample] = useState(null);
  const [resultForm, setResultForm] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [typesOpen, setTypesOpen] = useState(false);
  const [bloodMeta, setBloodMeta] = useState(null);
  const [stoolMeta, setStoolMeta] = useState(null);
  const [paramFormOpen, setParamFormOpen] = useState(false);
  const [paramTargetTest, setParamTargetTest] = useState(null);
  const [editingParam, setEditingParam] = useState(null);
  const [paramForm, setParamForm] = useState(emptyParasiteForm());

  const displayName = (item) => (i18n.language === 'ar' && item?.name_ar ? item.name_ar : item?.name);

  const labels = {
    positive: t('parasitology.positive'),
    negative: t('parasitology.negative'),
    notSet: t('parasitology.notSet'),
    notes: t('parasitology.notes'),
  };

  const loadQueue = () => {
    setLoading(true);
    samplesAPI.parasitologyQueue()
      .then(({ data }) => setQueue(data.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadQueue(); }, []);

  const loadParasTypes = useCallback(async () => {
    try {
      const { data } = await testsAPI.list({ limit: 100 });
      const blood = data.data.find((tst) => tst.code === PARAS_BLOOD);
      const stool = data.data.find((tst) => tst.code === PARAS_STOOL);
      const [bloodDetail, stoolDetail] = await Promise.all([
        blood ? testsAPI.get(blood.id) : null,
        stool ? testsAPI.get(stool.id) : null,
      ]);
      setBloodMeta(bloodDetail?.data?.data || null);
      setStoolMeta(stoolDetail?.data?.data || null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { loadParasTypes(); }, [loadParasTypes]);

  const reloadSampleForm = async (sample) => {
    if (!sample) return;
    const { data } = await samplesAPI.get(sample.id);
    const form = {};
    for (const test of parasTests(data.data)) {
      const testDetail = await testsAPI.get(test.test_id);
      let existing = null;
      try {
        const res = await resultsAPI.get(test.id);
        existing = res.data.data;
      } catch { /* no results */ }
      form[test.id] = (testDetail.data.data.parameters || []).map((p) => {
        const val = existing?.values?.find((v) => v.parameter_id === p.id);
        const prev = (resultForm[test.id] || []).find((f) => f.parameter_id === p.id);
        return {
          parameter_id: p.id,
          name: p.name,
          name_ar: p.name_ar,
          unit: p.unit,
          value: val?.value || prev?.value || '',
          displayName: i18n.language === 'ar' && p.name_ar ? p.name_ar : p.name,
        };
      });
    }
    setResultForm(form);
  };

  const openAddParasite = (testMeta) => {
    setParamTargetTest(testMeta);
    setEditingParam(null);
    const qualParams = (testMeta.parameters || []).filter((p) => p.unit === 'qual' && p.code !== 'NOTES');
    setParamForm({ ...emptyParasiteForm(), sort_order: qualParams.length });
    setParamFormOpen(true);
  };

  const openEditParasite = (param) => {
    const testMeta = bloodMeta?.parameters?.some((p) => p.id === param.id) ? bloodMeta : stoolMeta;
    setParamTargetTest(testMeta);
    setEditingParam(param);
    setParamForm({
      code: param.code || '',
      name: param.name || '',
      name_ar: param.name_ar || '',
      unit: param.unit || 'qual',
      sort_order: param.sort_order ?? 0,
    });
    setParamFormOpen(true);
  };

  const handleSaveParasite = async (e) => {
    e.preventDefault();
    if (!paramTargetTest) return;
    try {
      const payload = {
        ...paramForm,
        sort_order: Number(paramForm.sort_order),
        unit: 'qual',
        is_calculated: false,
        decimal_places: 0,
      };
      if (editingParam) {
        await testsAPI.updateParameter(editingParam.id, payload);
        toast.success(t('parasitology.paramUpdated'));
      } else {
        await testsAPI.addParameter(paramTargetTest.id, payload);
        toast.success(t('tests.paramAdded'));
      }
      setParamFormOpen(false);
      await loadParasTypes();
      if (selectedSample) await reloadSampleForm(selectedSample);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    }
  };

  const handleDeleteParasite = async (param) => {
    if (!window.confirm(t('parasitology.confirmDeleteParasite'))) return;
    try {
      await testsAPI.deleteParameter(param.id);
      toast.success(t('parasitology.paramDeleted'));
      await loadParasTypes();
      if (selectedSample) await reloadSampleForm(selectedSample);
    } catch (err) {
      const msg = err.response?.data?.error?.code === 'PROTECTED_PARAMETER'
        ? t('parasitology.protectedParam')
        : (err.response?.data?.error?.message || 'Error');
      toast.error(msg);
    }
  };

  const parasTests = (sample) => (sample?.tests || []).filter(
    (tst) => PARAS_TEST_CODES.has(tst.test_code)
  );

  const bloodTest = parasTests(selectedSample).find((tst) => tst.test_code === PARAS_BLOOD);
  const stoolTest = parasTests(selectedSample).find((tst) => tst.test_code === PARAS_STOOL);
  const primaryTest = bloodTest || stoolTest || parasTests(selectedSample)[0];

  const openSample = async (sample) => {
    const { data } = await samplesAPI.get(sample.id);
    setSelectedSample(data.data);

    const form = {};
    const allAttachments = [];

    for (const test of parasTests(data.data)) {
      const testDetail = await testsAPI.get(test.test_id);
      let existing = null;
      try {
        const res = await resultsAPI.get(test.id);
        existing = res.data.data;
      } catch { /* no results */ }

      if (existing?.attachments?.length) {
        allAttachments.push(...existing.attachments.map((a) => ({ ...a, sample_test_id: test.id })));
      }

      form[test.id] = (testDetail.data.data.parameters || []).map((p) => {
        const val = existing?.values?.find((v) => v.parameter_id === p.id);
        return {
          parameter_id: p.id,
          name: p.name,
          name_ar: p.name_ar,
          unit: p.unit,
          value: val?.value || '',
          displayName: i18n.language === 'ar' && p.name_ar ? p.name_ar : p.name,
        };
      });
    }

    setResultForm(form);
    setAttachments(allAttachments);
  };

  const updateField = (testId, idx, value) => {
    const updated = [...(resultForm[testId] || [])];
    updated[idx] = { ...updated[idx], value };
    setResultForm({ ...resultForm, [testId]: updated });
  };

  const submitResults = async () => {
    if (!selectedSample) return;

    const payloads = parasTests(selectedSample)
      .map((test) => {
        const fields = resultForm[test.id] || [];
        const values = fields.filter((v) => String(v.value ?? '').trim() !== '');
        if (!values.length) return null;
        return {
          sample_test_id: test.id,
          values: values.map((v) => ({ parameter_id: v.parameter_id, value: v.value })),
        };
      })
      .filter(Boolean);

    if (!payloads.length) return toast.error(t('parasitology.enterOneValue'));

    setSaving(true);
    try {
      for (const payload of payloads) {
        await resultsAPI.enter(payload);
      }
      toast.success(t('parasitology.saved'));
      if (primaryTest) {
        const res = await resultsAPI.get(primaryTest.id);
        const att = (res.data.data?.attachments || []).map((a) => ({
          ...a,
          sample_test_id: primaryTest.id,
        }));
        setAttachments(att);
      }
      loadQueue();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file || !primaryTest) return;
    setUploading(true);
    try {
      const { data } = await resultsAPI.uploadAttachment(primaryTest.id, file);
      const att = (data.data?.attachments || []).map((a) => ({
        ...a,
        sample_test_id: primaryTest.id,
      }));
      setAttachments(att);
      toast.success(t('parasitology.imageUploaded'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteImage = async (id) => {
    try {
      await resultsAPI.deleteAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      toast.success(t('parasitology.imageDeleted'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    }
  };

  const imageUrl = (url) => url;

  if (loading) return <div className="text-center py-20">{t('common.loading')}</div>;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="text-primary-600" />
            {t('parasitology.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('parasitology.subtitle')}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setTypesOpen(true)}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Settings2 size={16} />
            {t('parasitology.editTypes')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-3">
          <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">{t('nav.samples')}</h2>
          {queue.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => openSample(sample)}
              className={`card w-full text-start hover:border-primary-500 transition cursor-pointer ${selectedSample?.id === sample.id ? 'border-primary-500 ring-2 ring-primary-200' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono font-medium">{sample.sample_code}</span>
                <StatusBadge status={sample.status} label={t(`samples.statuses.${sample.status}`)} />
              </div>
              <p className="text-sm text-gray-500">{sample.customer_name}</p>
              <p className="text-sm">{sample.animal_code}</p>
              <p className="text-xs text-gray-400 mt-2">
                {sample.pending_tests} {t('parasitology.pendingTests')}
              </p>
            </button>
          ))}
          {!queue.length && (
            <p className="text-gray-500 text-center py-8 card">{t('parasitology.emptyQueue')}</p>
          )}
        </div>

        <div className="xl:col-span-2">
          {!selectedSample ? (
            <div className="card p-12 text-center text-gray-500">
              <Bug className="mx-auto mb-3 opacity-30" size={48} />
              <p>{t('parasitology.selectSample')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="card bg-primary-50/50 dark:bg-primary-900/20">
                <p className="font-mono font-bold text-lg">{selectedSample.sample_code}</p>
                <p className="text-sm text-gray-500">
                  {selectedSample.customer_name} · {selectedSample.animal_code}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ParasiteSection
                  title={t('parasitology.bloodSection')}
                  icon={Droplets}
                  test={bloodTest}
                  fields={bloodTest ? resultForm[bloodTest.id] || [] : []}
                  onChange={updateField}
                  labels={labels}
                  emptyHint={t('parasitology.noBloodTest')}
                />
                <ParasiteSection
                  title={t('parasitology.stoolSection')}
                  icon={Bug}
                  test={stoolTest}
                  fields={stoolTest ? resultForm[stoolTest.id] || [] : []}
                  onChange={updateField}
                  labels={labels}
                  emptyHint={t('parasitology.noStoolTest')}
                />
              </div>

              <div className="card">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Camera size={20} className="text-primary-600" />
                  {t('parasitology.microscopeImages')}
                </h3>
                <p className="text-xs text-gray-500 mb-3">{t('parasitology.addImage')}</p>

                {primaryTest ? (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => uploadImage(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="btn-secondary flex items-center gap-2 text-sm mb-4"
                    >
                      <Camera size={16} />
                      {uploading ? t('common.loading') : t('parasitology.uploadImage')}
                    </button>

                    {attachments.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {attachments.map((att) => (
                          <div key={att.id} className="relative group rounded-lg overflow-hidden border border-primary-200 dark:border-primary-700">
                            <img
                              src={imageUrl(att.file_url)}
                              alt={att.caption || 'microscope'}
                              className="w-full h-28 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => deleteImage(att.id)}
                              className="absolute top-1 end-1 p-1.5 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">{t('parasitology.selectSample')}</p>
                )}
              </div>

              <button
                type="button"
                onClick={submitResults}
                disabled={saving}
                className="btn-primary w-full py-3"
              >
                {saving ? t('common.loading') : t('parasitology.save')}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={typesOpen} onClose={() => setTypesOpen(false)} title={t('parasitology.editTypes')} size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ParasiteTypeList
            title={t('parasitology.bloodSection')}
            icon={Droplets}
            testMeta={bloodMeta}
            params={(bloodMeta?.parameters || []).filter((p) => p.unit === 'qual')}
            canManage={canManage}
            onAdd={openAddParasite}
            onEdit={openEditParasite}
            onDelete={handleDeleteParasite}
            displayName={displayName}
            addLabel={t('parasitology.addParasite')}
          />
          <ParasiteTypeList
            title={t('parasitology.stoolSection')}
            icon={Bug}
            testMeta={stoolMeta}
            params={(stoolMeta?.parameters || []).filter((p) => p.unit === 'qual')}
            canManage={canManage}
            onAdd={openAddParasite}
            onEdit={openEditParasite}
            onDelete={handleDeleteParasite}
            displayName={displayName}
            addLabel={t('parasitology.addParasite')}
          />
        </div>
      </Modal>

      <Modal
        isOpen={paramFormOpen}
        onClose={() => setParamFormOpen(false)}
        title={editingParam ? t('parasitology.editParasite') : t('parasitology.addParasite')}
        size="md"
      >
        <form onSubmit={handleSaveParasite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.paramCode')}</label>
            <input
              value={paramForm.code}
              onChange={(e) => setParamForm({ ...paramForm, code: e.target.value.toUpperCase() })}
              className="input-field"
              required
              disabled={!!editingParam}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.nameEn')}</label>
            <input
              value={paramForm.name}
              onChange={(e) => setParamForm({ ...paramForm, name: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.nameAr')}</label>
            <input
              value={paramForm.name_ar}
              onChange={(e) => setParamForm({ ...paramForm, name_ar: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('tests.unit')}</label>
            <input value={t('tests.unitQual')} className="input-field bg-gray-50" readOnly />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setParamFormOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
