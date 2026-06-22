import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Bug, Camera, Droplets, Trash2, Pencil, Plus, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import { samplesAPI, resultsAPI, testsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { isParasitologyTest } from '../utils/parasitologyTests';

const PARAS_BLOOD = 'PARAS-BLOOD';
const PARAS_STOOL = 'PARAS-STOOL';

const emptyParasiteForm = () => ({
  code: '', name: '', name_ar: '', unit: 'qual', sort_order: 0,
});

const createFinding = () => ({
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  parameter_id: '',
  value: '',
  pendingFile: null,
  attachment: null,
});

function QualToggle({ value, onChange, labels }) {
  return (
    <div className="flex gap-1">
      {[
        { v: 'Negative', label: labels.negative, active: 'bg-green-600 text-white' },
        { v: 'Positive', label: labels.positive, active: 'bg-red-600 text-white' },
      ].map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border border-primary-200 dark:border-primary-700 transition ${
            value === opt.v ? opt.active : 'hover:bg-primary-50 dark:hover:bg-primary-900/30'
          }`}
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

function FindingPanel({
  title,
  icon: Icon,
  test,
  testMeta,
  findings,
  notes,
  onFindingsChange,
  onNotesChange,
  labels,
  displayName,
  onUploadImage,
  onDeleteImage,
  uploadingId,
}) {
  const { t } = useTranslation();
  const fileRefs = useRef({});

  if (!test) return null;

  const qualOptions = (testMeta?.parameters || []).filter((p) => p.unit === 'qual' && p.code !== 'NOTES');
  const usedParamIds = new Set(findings.map((f) => f.parameter_id).filter(Boolean));

  const updateFinding = (clientId, patch) => {
    onFindingsChange(findings.map((f) => (f.clientId === clientId ? { ...f, ...patch } : f)));
  };

  const removeFinding = async (finding) => {
    if (finding.attachment?.id) {
      await onDeleteImage(finding.attachment.id, finding.clientId);
    }
    onFindingsChange(findings.filter((f) => f.clientId !== finding.clientId));
  };

  const addFinding = () => {
    onFindingsChange([...findings, createFinding()]);
  };

  const paramLabel = (parameterId) => {
    const p = qualOptions.find((o) => o.id === parameterId);
    return p ? displayName(p) : '';
  };

  return (
    <div className="card">
      <h3 className="font-semibold flex items-center gap-2 mb-4 pb-3 border-b border-primary-200 dark:border-primary-700">
        <Icon size={20} className="text-primary-600" />
        {title}
      </h3>

      {findings.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">{t('parasitology.noFindings')}</p>
      ) : (
        <div className="space-y-4">
          {findings.map((finding) => (
            <div
              key={finding.clientId}
              className="p-3 rounded-xl border border-primary-200/80 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-900/20 space-y-3"
            >
              <div className="flex flex-wrap gap-2 items-start">
                <div className="flex-1 min-w-[160px]">
                  <label className="text-xs text-gray-500 block mb-1">{t('parasitology.selectParasite')}</label>
                  <select
                    value={finding.parameter_id}
                    onChange={(e) => updateFinding(finding.clientId, { parameter_id: e.target.value })}
                    className="input-field text-sm"
                  >
                    <option value="">{t('parasitology.selectParasite')}</option>
                    {qualOptions
                      .filter((p) => p.id === finding.parameter_id || !usedParamIds.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{displayName(p)}</option>
                      ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-gray-500 block mb-1">{t('parasitology.result')}</label>
                  <QualToggle
                    value={finding.value}
                    onChange={(v) => updateFinding(finding.clientId, { value: v })}
                    labels={labels}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeFinding(finding)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg mt-5"
                  title={t('common.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-primary-200/60 dark:border-primary-700/60">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{t('parasitology.imagePerFinding')}</label>
                  <input
                    ref={(el) => { fileRefs.current[finding.clientId] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadImage(test.id, finding, file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={!finding.parameter_id || uploadingId === finding.clientId}
                    onClick={() => {
                      if (!finding.parameter_id) {
                        toast.error(t('parasitology.selectParasiteFirst'));
                        return;
                      }
                      fileRefs.current[finding.clientId]?.click();
                    }}
                    className="btn-secondary text-xs flex items-center gap-1.5 py-2"
                  >
                    <Camera size={14} />
                    {uploadingId === finding.clientId ? t('common.loading') : t('parasitology.uploadImage')}
                  </button>
                </div>

                {(finding.attachment?.file_url || finding.pendingFile) && (
                  <div className="relative group">
                    <img
                      src={
                        finding.attachment?.file_url
                          || (finding.pendingFile ? URL.createObjectURL(finding.pendingFile) : '')
                      }
                      alt={paramLabel(finding.parameter_id)}
                      className="w-20 h-20 object-cover rounded-lg border border-primary-200"
                    />
                    {finding.attachment?.id && (
                      <button
                        type="button"
                        onClick={() => onDeleteImage(finding.attachment.id, finding.clientId)}
                        className="absolute -top-1 -end-1 p-1 rounded-full bg-red-600 text-white"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addFinding}
        className="mt-4 w-full btn-secondary text-sm flex items-center justify-center gap-2 py-2.5"
      >
        <Plus size={16} />
        {t('parasitology.addFinding')}
      </button>

      <div className="mt-4 pt-4 border-t border-primary-200 dark:border-primary-700">
        <label className="text-sm font-medium block mb-1">{labels.notes}</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="input-field min-h-[60px] text-sm"
          placeholder={labels.notes}
        />
      </div>
    </div>
  );
}

function buildFindingsFromExisting(testDetail, existing) {
  const params = testDetail?.parameters || [];
  const qualParams = params.filter((p) => p.unit === 'qual' && p.code !== 'NOTES');
  const notesParam = params.find((p) => p.code === 'NOTES');
  const attachmentsByParam = {};
  (existing?.attachments || []).forEach((a) => {
    if (a.parameter_id) attachmentsByParam[a.parameter_id] = a;
  });

  const findings = qualParams
    .filter((p) => existing?.values?.some((v) => v.parameter_id === p.id && v.value))
    .map((p) => {
      const val = existing.values.find((v) => v.parameter_id === p.id);
      return {
        clientId: `${p.id}-loaded`,
        parameter_id: p.id,
        value: val?.value || '',
        pendingFile: null,
        attachment: attachmentsByParam[p.id] || null,
      };
    });

  const notes = existing?.values?.find((v) => v.parameter_id === notesParam?.id)?.value || '';
  return { findings, notes, notesParamId: notesParam?.id };
}

export default function Parasitology() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('tests.manage');

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSample, setSelectedSample] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);

  const [bloodFindings, setBloodFindings] = useState([]);
  const [stoolFindings, setStoolFindings] = useState([]);
  const [bloodNotes, setBloodNotes] = useState('');
  const [stoolNotes, setStoolNotes] = useState('');
  const [bloodNotesParamId, setBloodNotesParamId] = useState(null);
  const [stoolNotesParamId, setStoolNotesParamId] = useState(null);

  const [typesOpen, setTypesOpen] = useState(false);
  const [typesTab, setTypesTab] = useState('blood');
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

  const parasTests = (sample) => (sample?.tests || []).filter(isParasitologyTest);

  const bloodTest = parasTests(selectedSample).find((tst) => tst.test_code === PARAS_BLOOD);
  const stoolTest = parasTests(selectedSample).find((tst) => tst.test_code === PARAS_STOOL);
  const hasBloodPanel = !!bloodTest;
  const hasStoolPanel = !!stoolTest;

  const sectionLabel = (testMeta) => (
    testMeta?.code === PARAS_BLOOD ? t('parasitology.bloodSection') : t('parasitology.stoolSection')
  );

  const openSample = async (sample) => {
    const { data } = await samplesAPI.get(sample.id);
    setSelectedSample(data.data);

    const tests = parasTests(data.data);
    const bt = tests.find((tst) => tst.test_code === PARAS_BLOOD);
    const st = tests.find((tst) => tst.test_code === PARAS_STOOL);

    if (bt) {
      const testDetail = (await testsAPI.get(bt.test_id)).data.data;
      let existing = null;
      try {
        existing = (await resultsAPI.get(bt.id)).data.data;
      } catch { /* none */ }
      const loaded = buildFindingsFromExisting(testDetail, existing);
      setBloodFindings(loaded.findings);
      setBloodNotes(loaded.notes);
      setBloodNotesParamId(loaded.notesParamId);
    } else {
      setBloodFindings([]);
      setBloodNotes('');
      setBloodNotesParamId(null);
    }

    if (st) {
      const testDetail = (await testsAPI.get(st.test_id)).data.data;
      let existing = null;
      try {
        existing = (await resultsAPI.get(st.id)).data.data;
      } catch { /* none */ }
      const loaded = buildFindingsFromExisting(testDetail, existing);
      setStoolFindings(loaded.findings);
      setStoolNotes(loaded.notes);
      setStoolNotesParamId(loaded.notesParamId);
    } else {
      setStoolFindings([]);
      setStoolNotes('');
      setStoolNotesParamId(null);
    }
  };

  useEffect(() => {
    const sampleId = searchParams.get('sample');
    if (!sampleId || loading) return;
    const match = queue.find((s) => s.id === sampleId);
    if (match) {
      openSample(match);
      return;
    }
    samplesAPI.get(sampleId).then(({ data }) => openSample(data.data)).catch(() => {});
  }, [searchParams, queue, loading]);

  const buildValues = (findings, notesParamId, notes) => {
    const values = findings
      .filter((f) => f.parameter_id && f.value)
      .map((f) => ({ parameter_id: f.parameter_id, value: f.value }));
    if (notesParamId && String(notes).trim()) {
      values.push({ parameter_id: notesParamId, value: notes.trim() });
    }
    return values;
  };

  const bloodValuesCount = buildValues(bloodFindings, bloodNotesParamId, bloodNotes).length;
  const stoolValuesCount = buildValues(stoolFindings, stoolNotesParamId, stoolNotes).length;
  const canSave = (hasBloodPanel && bloodValuesCount > 0) || (hasStoolPanel && stoolValuesCount > 0);

  const uploadPendingImages = async (testId, findings, setFindings) => {
    for (const finding of findings) {
      if (!finding.pendingFile || !finding.parameter_id) continue;
      const { data } = await resultsAPI.uploadAttachment(testId, finding.pendingFile, {
        parameter_id: finding.parameter_id,
      });
      const att = (data.data?.attachments || []).find((a) => a.parameter_id === finding.parameter_id);
      setFindings((prev) => prev.map((f) => (
        f.clientId === finding.clientId
          ? { ...f, pendingFile: null, attachment: att || f.attachment }
          : f
      )));
    }
  };

  const handleUploadImage = async (testId, finding, file, setFindings) => {
    if (!finding.parameter_id) {
      toast.error(t('parasitology.selectParasiteFirst'));
      return;
    }

    setUploadingId(finding.clientId);
    try {
      const { data } = await resultsAPI.uploadAttachment(testId, file, {
        parameter_id: finding.parameter_id,
      });
      const att = (data.data?.attachments || []).find((a) => a.parameter_id === finding.parameter_id);
      setFindings((prev) => prev.map((f) => (
        f.clientId === finding.clientId
          ? { ...f, pendingFile: null, attachment: att || data.data?.attachments?.at(-1) || null }
          : f
      )));
      toast.success(t('parasitology.imageUploaded'));
    } catch (err) {
      const msg = err.response?.data?.error?.message;
      toast.error(msg && msg !== 'An unexpected error occurred'
        ? msg
        : t('parasitology.imageUploadFailed'));
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteImage = async (attachmentId, clientId, setFindings) => {
    try {
      await resultsAPI.deleteAttachment(attachmentId);
      setFindings((prev) => prev.map((f) => (
        f.clientId === clientId ? { ...f, attachment: null, pendingFile: null } : f
      )));
      toast.success(t('parasitology.imageDeleted'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    }
  };

  const submitResults = async () => {
    if (!selectedSample) return;

    const jobs = [];
    if (bloodTest) {
      const values = buildValues(bloodFindings, bloodNotesParamId, bloodNotes);
      if (values.length) jobs.push({ test: bloodTest, values, findings: bloodFindings, setFindings: setBloodFindings });
    }
    if (stoolTest) {
      const values = buildValues(stoolFindings, stoolNotesParamId, stoolNotes);
      if (values.length) jobs.push({ test: stoolTest, values, findings: stoolFindings, setFindings: setStoolFindings });
    }

    if (!jobs.length) return toast.error(t('parasitology.enterOneValue'));

    setSaving(true);
    try {
      for (const job of jobs) {
        await resultsAPI.enter({ sample_test_id: job.test.id, values: job.values });
        await uploadPendingImages(job.test.id, job.findings, job.setFindings);
      }
      const { data: queueData } = await samplesAPI.parasitologyQueue();
      const stillInQueue = (queueData.data || []).some((s) => s.id === selectedSample.id);
      toast.success(stillInQueue ? t('parasitology.saved') : t('parasitology.savedGoValidate'));
      loadQueue();
      if (stillInQueue) {
        await openSample(selectedSample);
      } else {
        setSelectedSample(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    } finally {
      setSaving(false);
    }
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
      if (selectedSample) await openSample(selectedSample);
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
      if (selectedSample) await openSample(selectedSample);
    } catch (err) {
      const msg = err.response?.data?.error?.code === 'PROTECTED_PARAMETER'
        ? t('parasitology.protectedParam')
        : (err.response?.data?.error?.message || 'Error');
      toast.error(msg);
    }
  };

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
          <button type="button" onClick={() => setTypesOpen(true)} className="btn-secondary text-sm flex items-center gap-2">
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
                <p className="text-xs text-primary-700 dark:text-primary-300 mt-2">
                  {hasBloodPanel && hasStoolPanel
                    ? t('parasitology.orderedBoth')
                    : hasBloodPanel
                      ? t('parasitology.orderedBloodOnly')
                      : hasStoolPanel
                        ? t('parasitology.orderedStoolOnly')
                        : t('parasitology.noParasTests')}
                </p>
              </div>

              <div className={`grid gap-4 ${hasBloodPanel && hasStoolPanel ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                {hasBloodPanel && (
                <FindingPanel
                  title={t('parasitology.bloodSection')}
                  icon={Droplets}
                  test={bloodTest}
                  testMeta={bloodMeta}
                  findings={bloodFindings}
                  notes={bloodNotes}
                  onFindingsChange={setBloodFindings}
                  onNotesChange={setBloodNotes}
                  labels={labels}
                  displayName={displayName}
                  onUploadImage={(testId, finding, file) => handleUploadImage(testId, finding, file, setBloodFindings)}
                  onDeleteImage={(id, clientId) => handleDeleteImage(id, clientId, setBloodFindings)}
                  uploadingId={uploadingId}
                />
                )}
                {hasStoolPanel && (
                <FindingPanel
                  title={t('parasitology.stoolSection')}
                  icon={Bug}
                  test={stoolTest}
                  testMeta={stoolMeta}
                  findings={stoolFindings}
                  notes={stoolNotes}
                  onFindingsChange={setStoolFindings}
                  onNotesChange={setStoolNotes}
                  labels={labels}
                  displayName={displayName}
                  onUploadImage={(testId, finding, file) => handleUploadImage(testId, finding, file, setStoolFindings)}
                  onDeleteImage={(id, clientId) => handleDeleteImage(id, clientId, setStoolFindings)}
                  uploadingId={uploadingId}
                />
                )}
              </div>

              <p className="text-xs text-gray-500 text-center">{t('parasitology.saveHint')}</p>

              <button
                type="button"
                onClick={submitResults}
                disabled={saving || !canSave}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {saving ? t('common.loading') : t('parasitology.save')}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={typesOpen} onClose={() => setTypesOpen(false)} title={t('parasitology.editTypes')} size="lg">
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTypesTab('blood')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${typesTab === 'blood' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            <Droplets size={16} />
            {t('parasitology.bloodSection')}
          </button>
          <button
            type="button"
            onClick={() => setTypesTab('stool')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${typesTab === 'stool' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            <Bug size={16} />
            {t('parasitology.stoolSection')}
          </button>
        </div>
        {typesTab === 'blood' ? (
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
        ) : (
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
        )}
      </Modal>

      <Modal
        isOpen={paramFormOpen}
        onClose={() => setParamFormOpen(false)}
        title={
          editingParam
            ? `${t('parasitology.editParasite')} — ${sectionLabel(paramTargetTest)}`
            : `${t('parasitology.addParasite')} — ${sectionLabel(paramTargetTest)}`
        }
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
