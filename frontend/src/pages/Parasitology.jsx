import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Bug, Camera, Droplets, Trash2, Pencil, Plus, Settings2, Loader2, Shield, Microscope } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import { samplesAPI, resultsAPI, testsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  isParasitologyTest,
  isBrucellaTestCode,
  PARAS_BLOOD,
  PARAS_STOOL,
  PARAS_CATEGORY_CODE,
  MICRO_PANEL_ORDER,
  noneFoundValueForTest,
  isNoneFoundValue,
} from '../utils/parasitologyTests';
import mediaUrl from '../utils/mediaUrl';

const sortMicroTests = (tests = []) =>
  [...tests].sort((a, b) => {
    const ao = MICRO_PANEL_ORDER[a.code] ?? 99;
    const bo = MICRO_PANEL_ORDER[b.code] ?? 99;
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '');
  });

const panelPresentation = (testMeta, t, i18n) => {
  const code = testMeta?.code;
  if (code === PARAS_BLOOD) return { icon: Droplets, title: t('parasitology.bloodSection') };
  if (code === PARAS_STOOL) return { icon: Bug, title: t('parasitology.stoolSection') };
  if (isBrucellaTestCode(code)) return { icon: Shield, title: t('parasitology.brucellaSection') };
  const name = i18n.language === 'ar' && testMeta?.name_ar ? testMeta.name_ar : testMeta?.name;
  return { icon: Microscope, title: name || code };
};
const API_ORIGIN = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

/** Ensure mobile camera files have a recognizable name/type for the server. */
const normalizeUploadFile = (file) => {
  if (!file || typeof File === 'undefined') return file;
  const hasExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || '');
  if (hasExt && file.type && file.type.startsWith('image/')) return file;
  const type = file.type && file.type.startsWith('image/')
    ? file.type
    : 'image/jpeg';
  const ext = type.includes('png') ? '.png'
    : type.includes('webp') ? '.webp'
      : type.includes('gif') ? '.gif'
        : type.includes('heic') ? '.heic'
          : '.jpg';
  const base = (file.name || 'microscope').replace(/\.[^.]+$/, '') || 'microscope';
  return new File([file], `${base}${ext}`, { type, lastModified: file.lastModified });
};

const withRetry = async (fn, { retries = 2, delayMs = 1200 } = {}) => {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const retryable = !status || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === retries) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
};

const emptyParasiteForm = () => ({
  code: '', name: '', name_ar: '', unit: 'qual', sort_order: 0,
});

const createFinding = () => ({
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  parameter_id: '',
  value: '',
  pendingFile: null,
  attachment: null,
  uploadingImage: false,
  previewUrl: null,
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
              {canManage && p.code !== 'NOTES' && p.code !== 'RESULT' && (
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
  onQueueImage,
  onDeleteImage,
}) {
  const { t } = useTranslation();
  const fileRefs = useRef({});

  if (!test) return null;

  const allQual = (testMeta?.parameters || []).filter((p) => p.unit === 'qual' && p.code !== 'NOTES');
  const resultParam = allQual.find((p) => p.code === 'RESULT');
  const parasiteOptions = allQual.filter((p) => p.code !== 'RESULT');
  // Brucella panel is RESULT-only; blood/stool pick individual organisms.
  const selectableOptions = parasiteOptions.length > 0 ? parasiteOptions : allQual;
  const usedParamIds = new Set(findings.map((f) => f.parameter_id).filter(Boolean));
  const noneValue = noneFoundValueForTest(testMeta?.code);
  const noneLabel = isBrucellaTestCode(testMeta?.code)
    ? t('parasitology.noMaltaFound')
    : t('parasitology.noParasiteFound');
  const isNoneSelected = Boolean(
    resultParam
    && findings.length === 1
    && String(findings[0].parameter_id) === String(resultParam.id)
    && isNoneFoundValue(findings[0].value)
  );

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
    if (isNoneSelected) return;
    onFindingsChange([...findings, createFinding()]);
  };

  const applyNoneFound = async () => {
    if (!resultParam) {
      toast.error(t('parasitology.noneResultMissing'));
      return;
    }
    for (const finding of findings) {
      if (finding.attachment?.id) {
        try {
          await resultsAPI.deleteAttachment(finding.attachment.id);
        } catch { /* backend also clears on save */ }
      }
    }
    onFindingsChange([{
      clientId: `none-${resultParam.id}`,
      parameter_id: resultParam.id,
      value: noneValue,
      pendingFile: null,
      attachment: null,
      uploadingImage: false,
      previewUrl: null,
    }]);
  };

  const clearNoneFound = () => {
    const primary = selectableOptions[0] || resultParam;
    if (!primary) {
      onFindingsChange([]);
      return;
    }
    onFindingsChange([{
      clientId: `${primary.id}-default`,
      parameter_id: primary.id,
      value: '',
      pendingFile: null,
      attachment: null,
      uploadingImage: false,
      previewUrl: null,
    }]);
  };

  const paramLabel = (parameterId) => {
    const p = allQual.find((o) => o.id === parameterId);
    return p ? displayName(p) : '';
  };

  return (
    <div className="card">
      <h3 className="font-semibold flex items-center gap-2 mb-4 pb-3 border-b border-primary-200 dark:border-primary-700">
        <Icon size={20} className="text-primary-600" />
        {title}
      </h3>

      <button
        type="button"
        onClick={() => (isNoneSelected ? clearNoneFound() : applyNoneFound())}
        className={`mb-4 w-full text-start px-3 py-2.5 rounded-lg border text-sm transition ${
          isNoneSelected
            ? 'border-green-600 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'border-primary-200 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20'
        }`}
      >
        {noneLabel}
      </button>

      {isNoneSelected ? (
        <p className="text-sm text-green-700 dark:text-green-300 text-center py-3 px-2 rounded-lg bg-green-50/80 dark:bg-green-900/20">
          {noneValue}
        </p>
      ) : findings.length === 0 ? (
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
                    {selectableOptions
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
                      if (file) onQueueImage(finding, file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={!finding.parameter_id || finding.uploadingImage}
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
                    {t('parasitology.uploadImage')}
                  </button>
                </div>

                {(finding.attachment?.file_url || finding.previewUrl || finding.pendingFile) && (
                  <div className="relative group">
                    {finding.uploadingImage ? (
                      <div className="w-20 h-20 rounded-lg border border-primary-200 bg-primary-50 flex items-center justify-center">
                        <Loader2 size={22} className="animate-spin text-primary-600" />
                      </div>
                    ) : (
                      <img
                        src={
                          finding.attachment?.file_url
                            ? mediaUrl(finding.attachment.file_url)
                            : (finding.previewUrl || (finding.pendingFile ? URL.createObjectURL(finding.pendingFile) : ''))
                        }
                        alt={paramLabel(finding.parameter_id)}
                        className="w-20 h-20 object-cover rounded-lg border border-primary-200"
                        onError={() => {
                          if (finding.attachment?.file_url) {
                            updateFinding(finding.clientId, { attachment: null });
                          }
                        }}
                      />
                    )}
                    {finding.attachment?.id && (
                      <button
                        type="button"
                        onClick={() => onDeleteImage(finding.attachment.id, finding.clientId)}
                        className="absolute -top-1 -end-1 p-1 rounded-full bg-red-600 text-white"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {finding.pendingFile && !finding.attachment?.id && !finding.uploadingImage && (
                      <button
                        type="button"
                        onClick={() => onQueueImage(finding, null)}
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

      {!isNoneSelected && (
        <button
          type="button"
          onClick={addFinding}
          className="mt-4 w-full btn-secondary text-sm flex items-center justify-center gap-2 py-2.5"
        >
          <Plus size={16} />
          {t('parasitology.addFinding')}
        </button>
      )}

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
    if (a.parameter_id) attachmentsByParam[String(a.parameter_id)] = a;
  });

  const findings = qualParams
    .filter((p) => existing?.values?.some((v) => String(v.parameter_id) === String(p.id) && v.value))
    .map((p) => {
      const val = existing.values.find((v) => String(v.parameter_id) === String(p.id));
      return {
        clientId: `${p.id}-loaded`,
        parameter_id: p.id,
        value: val?.value || '',
        pendingFile: null,
        attachment: attachmentsByParam[String(p.id)] || null,
        uploadingImage: false,
        previewUrl: null,
      };
    });

  const notes = existing?.values?.find((v) => v.parameter_id === notesParam?.id)?.value || '';
  return { findings: ensureDefaultFindings(testDetail, findings), notes, notesParamId: notesParam?.id };
}

function ensureDefaultFindings(testDetail, findings) {
  if (findings.length > 0) return findings;
  const qualParams = (testDetail?.parameters || []).filter((p) => p.unit === 'qual' && p.code !== 'NOTES');
  if (!qualParams.length) return findings;
  const parasites = qualParams.filter((p) => p.code !== 'RESULT');
  const primary = parasites[0] || qualParams.find((p) => p.code === 'RESULT') || qualParams[0];
  return [{
    clientId: `${primary.id}-default`,
    parameter_id: primary.id,
    value: '',
    pendingFile: null,
    attachment: null,
    uploadingImage: false,
    previewUrl: null,
  }];
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
  const [panels, setPanels] = useState({});

  const [typesOpen, setTypesOpen] = useState(false);
  const [typesTab, setTypesTab] = useState(null);
  const [microCatalog, setMicroCatalog] = useState([]);
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

  // Wake Render server before user uploads (reduces 502 on cold start).
  useEffect(() => {
    fetch(`${API_ORIGIN}/api/health`).catch(() => {});
  }, []);

  const loadParasTypes = useCallback(async () => {
    try {
      const { data } = await testsAPI.list({ limit: 200 });
      const microTests = sortMicroTests(
        (data.data || []).filter((tst) => tst.category_code === PARAS_CATEGORY_CODE)
      );
      const details = await Promise.all(
        microTests.map((tst) => testsAPI.get(tst.id).catch(() => null))
      );
      setMicroCatalog(details.map((d) => d?.data?.data).filter(Boolean));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { loadParasTypes(); }, [loadParasTypes]);

  const parasTests = (sample) => (sample?.tests || []).filter(isParasitologyTest);
  const panelList = Object.values(panels);
  const orderedPanelLabels = panelList.map((p) => panelPresentation(p.testMeta, t, i18n).title);
  const panelCount = panelList.length;

  const sectionLabel = (testMeta) => panelPresentation(testMeta, t, i18n).title;

  const updatePanel = (sampleTestId, patch) => {
    setPanels((prev) => ({
      ...prev,
      [sampleTestId]: { ...prev[sampleTestId], ...patch },
    }));
  };

  const openSample = async (sample) => {
    const { data } = await samplesAPI.get(sample.id);
    setSelectedSample(data.data);

    const tests = parasTests(data.data);
    const loaded = await Promise.all(tests.map(async (sampleTest) => {
      const testDetail = (await testsAPI.get(sampleTest.test_id)).data.data;
      let existing = null;
      try {
        existing = (await resultsAPI.get(sampleTest.id)).data.data;
      } catch { /* none */ }
      const { findings, notes, notesParamId } = buildFindingsFromExisting(testDetail, existing);
      return { sampleTest, testMeta: testDetail, findings, notes, notesParamId };
    }));

    const nextPanels = {};
    loaded.forEach((p) => { nextPanels[p.sampleTest.id] = p; });
    setPanels(nextPanels);
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
    const seen = new Set();
    const values = findings
      .filter((f) => f.parameter_id && f.value)
      .filter((f) => {
        if (seen.has(f.parameter_id)) return false;
        seen.add(f.parameter_id);
        return true;
      })
      .map((f) => ({ parameter_id: f.parameter_id, value: f.value }));
    if (notesParamId && String(notes).trim()) {
      values.push({ parameter_id: notesParamId, value: notes.trim() });
    }
    return values;
  };

  const canSave = panelList.some(
    (p) => buildValues(p.findings, p.notesParamId, p.notes).length > 0
  );

  const uploadOneImage = async (testId, finding, setFindings) => {
    if (!finding.pendingFile || !finding.parameter_id || !testId) return null;
    const file = normalizeUploadFile(finding.pendingFile);
    await withRetry(() => resultsAPI.uploadAttachment(testId, file, {
      parameter_id: finding.parameter_id,
    }), { retries: 2, delayMs: 1200 });
    const res = await resultsAPI.get(testId);
    const att = (res.data.data?.attachments || []).find(
      (a) => String(a.parameter_id) === String(finding.parameter_id)
    );
    setFindings((prev) => prev.map((f) => (
      f.clientId === finding.clientId
        ? {
          ...f,
          pendingFile: null,
          uploadingImage: false,
          previewUrl: null,
          attachment: att || f.attachment,
        }
        : f
    )));
    return att;
  };

  const uploadPendingImages = async (testId, findings, setFindings) => {
    const pending = findings.filter((f) => f.pendingFile && f.parameter_id);
    if (!pending.length) return [];
    const results = await Promise.allSettled(
      pending.map((finding) => uploadOneImage(testId, finding, setFindings))
    );
    return results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.response?.data?.error?.message || r.reason?.message || 'upload');
  };

  const uploadImageForFinding = async (testId, finding, file, setFindings) => {
    if (!file) {
      setFindings((prev) => prev.map((f) => (
        f.clientId === finding.clientId
          ? { ...f, pendingFile: null, previewUrl: null, uploadingImage: false }
          : f
      )));
      return;
    }
    if (!finding.parameter_id) {
      toast.error(t('parasitology.selectParasiteFirst'));
      return;
    }
    if (!testId) return;

    const previewUrl = URL.createObjectURL(file);
    setFindings((prev) => prev.map((f) => (
      f.clientId === finding.clientId
        ? { ...f, pendingFile: file, attachment: null, uploadingImage: true, previewUrl }
        : f
    )));

    try {
      await uploadOneImage(testId, { ...finding, pendingFile: file }, setFindings);
      toast.success(t('parasitology.imageUploaded'));
    } catch (err) {
      setFindings((prev) => prev.map((f) => (
        f.clientId === finding.clientId ? { ...f, uploadingImage: false } : f
      )));
      const status = err.response?.status;
      if (status === 502 || status === 503 || status === 504) {
        toast.error(t('parasitology.serverWaking'));
      } else {
        toast.error(err.response?.data?.error?.message || t('parasitology.imageUploadFailed'));
      }
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

    const jobs = panelList
      .map((panel) => {
        const values = buildValues(panel.findings, panel.notesParamId, panel.notes);
        if (!values.length) return null;
        return {
          test: panel.sampleTest,
          values,
          findings: panel.findings,
          sampleTestId: panel.sampleTest.id,
          notes: panel.notes,
        };
      })
      .filter(Boolean);

    if (!jobs.length) return toast.error(t('parasitology.enterOneValue'));

    const stillUploading = jobs.some((job) => job.findings.some((f) => f.uploadingImage));
    if (stillUploading) return toast.error(t('parasitology.waitForUpload'));

    setSaving(true);
    try {
      const sampleId = selectedSample.id;

      const uploadFailures = [];
      for (const job of jobs) {
        const failed = await uploadPendingImages(
          job.test.id,
          job.findings,
          (findings) => updatePanel(job.sampleTestId, { findings })
        );
        uploadFailures.push(...failed);
      }

      // Approve in one request (faster than enter + validate separately)
      await withRetry(() => resultsAPI.approveBatch(
        jobs.map((job) => ({
          sample_test_id: job.test.id,
          values: job.values,
          doctor_notes: job.notes?.trim() || '',
        }))
      ), { retries: 2, delayMs: 1200 });

      if (uploadFailures.length) {
        toast.error(uploadFailures[0] || t('parasitology.imageUploadFailed'));
      }

      const { data: queueData } = await samplesAPI.parasitologyQueue();
      const stillInQueue = (queueData.data || []).some((s) => s.id === sampleId);
      const allParasOnSample = parasTests(selectedSample);
      const approvedAll = jobs.length === allParasOnSample.length && !stillInQueue;

      loadQueue();
      if (approvedAll) {
        toast.success(t('parasitology.approved'));
        setSelectedSample(null);
      } else if (stillInQueue) {
        toast.success(t('parasitology.approvedPartial'));
        await openSample({ id: sampleId });
      } else {
        toast.success(t('parasitology.approved'));
        setSelectedSample(null);
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      if (status === 502 || status === 503) {
        toast.error(t('parasitology.serverWaking'));
      } else {
        toast.error(msg || 'Error');
      }
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
    const testMeta = microCatalog.find((m) => m.parameters?.some((p) => p.id === param.id));
    setParamTargetTest(testMeta || null);
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
          <button
            type="button"
            onClick={() => {
              setTypesTab(microCatalog[0]?.id || null);
              setTypesOpen(true);
            }}
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
                <p className="text-xs text-primary-700 dark:text-primary-300 mt-2">
                  {orderedPanelLabels.length
                    ? t('parasitology.orderedTests', { tests: orderedPanelLabels.join(' · ') })
                    : t('parasitology.noParasTests')}
                </p>
              </div>

              <div className={`grid gap-4 ${panelCount > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                {panelList.map((panel) => {
                  const { icon: PanelIcon, title } = panelPresentation(panel.testMeta, t, i18n);
                  const sampleTestId = panel.sampleTest.id;
                  return (
                    <FindingPanel
                      key={sampleTestId}
                      title={title}
                      icon={PanelIcon}
                      test={panel.sampleTest}
                      testMeta={panel.testMeta}
                      findings={panel.findings}
                      notes={panel.notes}
                      onFindingsChange={(findings) => updatePanel(sampleTestId, { findings })}
                      onNotesChange={(notes) => updatePanel(sampleTestId, { notes })}
                      labels={labels}
                      displayName={displayName}
                      onQueueImage={(finding, file) => uploadImageForFinding(
                        panel.sampleTest.id,
                        finding,
                        file,
                        (findings) => updatePanel(sampleTestId, { findings })
                      )}
                      onDeleteImage={(id, clientId) => handleDeleteImage(
                        id,
                        clientId,
                        (findings) => updatePanel(sampleTestId, { findings })
                      )}
                    />
                  );
                })}
              </div>

              <p className="text-xs text-gray-500 text-center">{t('parasitology.approveHint')}</p>

              <button
                type="button"
                onClick={submitResults}
                disabled={saving || !canSave}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {saving ? t('common.loading') : t('parasitology.approve')}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={typesOpen} onClose={() => setTypesOpen(false)} title={t('parasitology.editTypes')} size="lg">
        <div className="flex flex-wrap gap-2 mb-4">
          {microCatalog.map((testMeta) => {
            const { icon: TabIcon, title } = panelPresentation(testMeta, t, i18n);
            return (
              <button
                key={testMeta.id}
                type="button"
                onClick={() => setTypesTab(testMeta.id)}
                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${typesTab === testMeta.id ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
              >
                <TabIcon size={16} />
                {title}
              </button>
            );
          })}
        </div>
        {microCatalog
          .filter((testMeta) => testMeta.id === typesTab)
          .map((testMeta) => {
            const { icon: TabIcon, title } = panelPresentation(testMeta, t, i18n);
            return (
              <ParasiteTypeList
                key={testMeta.id}
                title={title}
                icon={TabIcon}
                testMeta={testMeta}
                params={(testMeta.parameters || []).filter((p) => p.unit === 'qual')}
                canManage={canManage}
                onAdd={openAddParasite}
                onEdit={openEditParasite}
                onDelete={handleDeleteParasite}
                displayName={displayName}
                addLabel={t('parasitology.addParasite')}
              />
            );
          })}
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
