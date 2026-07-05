import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, Eye, FileText, FilePlus, RotateCcw, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { reportsAPI, samplesAPI, notificationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const LAB_ROLES = new Set(['lab_specialist', 'lab_technician', 'manager', 'admin']);
const VET_ROLES = new Set(['veterinarian', 'manager', 'admin']);

function ApprovalLine({ label, approved, approverName, approvedAt, canApprove, onApprove, approving }) {
  const { t, i18n } = useTranslation();

  const formatApprovalAt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-GB';
    const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} ${time}`;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-primary-200/60 rounded-lg bg-white dark:bg-gray-900/40">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary-800 dark:text-primary-200">{label}</p>
        {approved ? (
          <div className="text-sm text-green-600 dark:text-green-400 mt-1">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{t('reports.approvedBy')}: {approverName}</span>
            </p>
            {approvedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                {formatApprovalAt(approvedAt)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-1">{t('reports.pendingApproval')}</p>
        )}
      </div>
      {!approved && canApprove && (
        <button
          type="button"
          onClick={onApprove}
          disabled={approving}
          className="shrink-0 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {approving ? t('common.loading') : t('reports.approvalDone')}
        </button>
      )}
    </div>
  );
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [completedSamples, setCompletedSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [approvingKey, setApprovingKey] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);

  const [selectedSample, setSelectedSample] = useState(null);
  const [language, setLanguage] = useState('ar');
  const [treatment, setTreatment] = useState('');
  const [approveLabOnGenerate, setApproveLabOnGenerate] = useState(false);
  const [approveVetOnGenerate, setApproveVetOnGenerate] = useState(false);

  const canApproveLab = LAB_ROLES.has(user?.role || user?.role_name);
  const canApproveVet = VET_ROLES.has(user?.role || user?.role_name);
  const canSendSmsToCustomer = user?.role === 'admin' && hasPermission('notifications.send_report');
  const canRegeneratePdf = hasPermission('reports.generate');
  const userDisplayName = i18n.language === 'ar'
    ? (user?.full_name_ar || user?.full_name)
    : user?.full_name;

  const load = () => {
    setLoading(true);
    Promise.all([
      reportsAPI.list(),
      samplesAPI.list({ status: 'completed', limit: 50 }),
    ])
      .then(([reportsRes, samplesRes]) => {
        setReports(reportsRes.data.data);
        setCompletedSamples(samplesRes.data.data);
      })
      .catch((err) => toast.error(err.response?.data?.error?.message || t('common.error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const sampleId = searchParams.get('generate');
    if (!sampleId || !completedSamples.length || !canRegeneratePdf) return;
    const sample = completedSamples.find((s) => s.id === sampleId);
    if (sample) openGenerateForSample(sample);
  }, [searchParams, completedSamples, canRegeneratePdf]);

  const handleVerify = async () => {
    try {
      const { data } = await reportsAPI.verify(verifyCode);
      setVerifyResult(data.data);
      toast.success(t('reports.validReport'));
    } catch {
      toast.error(t('reports.invalidCode'));
      setVerifyResult(null);
    }
  };

  const sendToCustomer = async (report) => {
    setSendingId(report.id);
    try {
      const { data: resp } = await notificationsAPI.sendReport(report.sample_id, 'sms');
      if (resp.dryRun) {
        toast(resp.userMessage || t('notifications.dryRunWarning'), { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(t('workflow.sentToCustomer'));
      }
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'CHANNEL_DISABLED') {
        toast.error(t('notifications.channelDisabled'));
      } else {
        toast.error(err.response?.data?.error?.message || 'خطأ');
      }
    } finally {
      setSendingId(null);
    }
  };

  const openPdf = async (report) => {
    try {
      await reportsAPI.openPdf(report.pdf_url);
    } catch {
      toast.error(t('reports.openFailed'));
    }
  };

  const regeneratePdf = async (report) => {
    setRegeneratingId(report.id);
    try {
      await reportsAPI.regenerateAndOpen(report.id, report.pdf_url);
      toast.success(t('reports.updateReportDone'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('reports.regenerateFailed'));
    } finally {
      setRegeneratingId(null);
    }
  };

  const openGenerateForSample = (sample) => {
    setSelectedSample(sample);
    setTreatment('');
    setLanguage('ar');
    setApproveLabOnGenerate(false);
    setApproveVetOnGenerate(false);
    setGenerateOpen(true);
  };

  const handleApprove = async (reportId, type) => {
    setApprovingKey(`${reportId}-${type}`);
    try {
      await reportsAPI.approve(reportId, type);
      toast.success(t('reports.approvalDone'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('reports.approvalFailed'));
    } finally {
      setApprovingKey(null);
    }
  };

  const generateReport = async () => {
    if (!selectedSample) return;
    setGenerating(true);
    try {
      const run = () => reportsAPI.generate(selectedSample.id, {
        language,
        treatment_recommendations: treatment,
        approve_lab: approveLabOnGenerate,
        approve_vet: approveVetOnGenerate,
      });

      let data;
      try {
        ({ data } = await run());
      } catch (err) {
        const status = err.response?.status;
        if (status === 502 || status === 503 || status === 504) {
          await new Promise((r) => setTimeout(r, 3000));
          ({ data } = await run());
        } else {
          throw err;
        }
      }

      toast.success(`${t('reports.created')} ${data.data.report_number}`);
      setGenerateOpen(false);
      setSelectedSample(null);
      load();
      navigate(`/reports/${data.data.id}/view`);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message;
      if (status === 502 || status === 503) {
        toast.error(t('parasitology.serverWaking'));
      } else {
        toast.error(msg || t('reports.generateFailed'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const approverName = (report, type) => {
    const isAr = i18n.language === 'ar';
    if (type === 'lab') {
      return isAr
        ? (report.lab_specialist_name_ar || report.lab_specialist_name)
        : report.lab_specialist_name;
    }
    return isAr ? (report.vet_name_ar || report.vet_name) : report.vet_name;
  };

  const columns = [
    { key: 'report_number', label: t('reports.reportNo') },
    { key: 'sample_code', label: t('reports.sampleNo') },
    { key: 'customer_name', label: t('customers.fullName') },
    { key: 'language', label: t('reports.language'), render: (r) => (r.language === 'ar' ? 'عربي' : 'EN') },
    { key: 'created_at', label: t('common.date'), render: (r) => {
      const d = new Date(r.created_at);
      return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    } },
    {
      key: 'approvals',
      label: t('reports.labApproval'),
      render: (r) => (
        <div className="space-y-2 min-w-0 w-full sm:min-w-[220px]" onClick={(e) => e.stopPropagation()}>
          <ApprovalLine
            label={t('reports.labApproval')}
            approved={!!r.lab_specialist_approved_by}
            approverName={approverName(r, 'lab')}
            approvedAt={r.lab_specialist_approved_at}
            canApprove={canApproveLab}
            approving={approvingKey === `${r.id}-lab`}
            onApprove={() => handleApprove(r.id, 'lab')}
          />
          <ApprovalLine
            label={t('reports.vetApproval')}
            approved={!!r.vet_approved_by}
            approverName={approverName(r, 'vet')}
            approvedAt={r.vet_approved_at}
            canApprove={canApproveVet}
            approving={approvingKey === `${r.id}-vet`}
            onApprove={() => handleApprove(r.id, 'vet')}
          />
        </div>
      ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => navigate(`/reports/${r.id}/view`)}
            className="text-primary-600 flex items-center gap-1 text-sm"
          >
            <Eye size={14} /> {t('labReport.title')}
          </button>
          {r.pdf_url && (
            <>
              <button type="button" onClick={() => openPdf(r)} className="text-primary-600 flex items-center gap-1 text-sm">
                <Download size={14} /> PDF
              </button>
              {canRegeneratePdf && (
                <button
                  type="button"
                  onClick={() => regeneratePdf(r)}
                  disabled={regeneratingId === r.id}
                  className="text-amber-700 flex items-center gap-1 text-sm disabled:opacity-50"
                >
                  <RotateCcw size={14} /> {regeneratingId === r.id ? t('common.loading') : t('reports.updateReport')}
                </button>
              )}
            </>
          )}
          {canSendSmsToCustomer && (
            <button onClick={() => sendToCustomer(r)} disabled={sendingId === r.id} className="text-green-600 text-sm">
              {t('workflow.sendToCustomer')}
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
          <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
          <p className="text-sm text-primary-500 mt-1">{t('reports.subtitle')}</p>
        </div>
        {canRegeneratePdf && (
          <button onClick={() => { setSelectedSample(null); setGenerateOpen(true); }} className="btn-primary flex items-center gap-2">
            <FilePlus size={18} /> {t('reports.generate')}
          </button>
        )}
      </div>

      <div className="card mb-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText size={18} /> {t('reports.verify')}</h3>
        <div className="flex gap-2">
          <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder={t('reports.verifyPlaceholder')} className="input-field flex-1" />
          <button onClick={handleVerify} className="btn-primary">{t('reports.verifyBtn')}</button>
        </div>
        {verifyResult && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
            <p className="text-green-700 dark:text-green-400 font-medium">✓ {t('reports.validReport')}</p>
            <p>{verifyResult.report_number} | {verifyResult.sample_code} | {verifyResult.customer_name}</p>
          </div>
        )}
      </div>

      <DataTable columns={columns} data={reports} loading={loading} />

      <Modal
        isOpen={generateOpen}
        onClose={() => { setGenerateOpen(false); setSelectedSample(null); }}
        title={t('reports.generate')}
        size="lg"
      >
        {!selectedSample ? (
          <>
            <p className="text-sm text-gray-500 mb-4">{t('reports.selectSampleHint')}</p>
            {completedSamples.length === 0 ? (
              <p className="text-center text-gray-500 py-8">{t('reports.noCompleted')}</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {completedSamples.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openGenerateForSample(s)}
                    className="w-full text-start p-3 border rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition"
                  >
                    <p className="font-mono font-medium">{s.sample_code}</p>
                    <p className="text-sm text-gray-500">{s.customer_name} — {s.animal_code}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
              <p className="font-mono font-semibold">{selectedSample.sample_code}</p>
              <p className="text-sm text-primary-600">{selectedSample.customer_name} — {selectedSample.animal_code}</p>
              <button type="button" onClick={() => setSelectedSample(null)} className="text-xs text-primary-500 mt-1 underline">
                {t('reports.changeSample')}
              </button>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setLanguage('ar')} className={`flex-1 py-2 rounded-lg text-sm ${language === 'ar' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>عربي</button>
              <button type="button" onClick={() => setLanguage('en')} className={`flex-1 py-2 rounded-lg text-sm ${language === 'en' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>English</button>
            </div>

            <div className="border border-primary-300/50 rounded-lg overflow-hidden">
              <div className="bg-primary-400 text-white px-3 py-2 text-sm font-medium flex items-center gap-2">
                <Stethoscope size={16} /> {t('reports.treatmentSection')}
              </div>
              <textarea
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                dir={language === 'ar' ? 'rtl' : 'ltr'}
                className={`input-field border-0 rounded-none min-h-[120px] ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={t('reports.treatmentPlaceholder')}
                rows={5}
              />
              <p className="text-xs text-primary-500 px-3 py-2 bg-primary-50/50">{t('reports.treatmentHint')}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-primary-800">{t('reports.labApproval')} / {t('reports.vetApproval')}</p>
              {canApproveLab && (
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-900/10">
                  <input
                    type="checkbox"
                    checked={approveLabOnGenerate}
                    onChange={(e) => setApproveLabOnGenerate(e.target.checked)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('reports.approveLab')}</p>
                    <p className="text-xs text-gray-500">{userDisplayName}</p>
                  </div>
                  {approveLabOnGenerate && <CheckCircle2 size={20} className="text-green-600 shrink-0" />}
                </label>
              )}
              {canApproveVet && (
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-900/10">
                  <input
                    type="checkbox"
                    checked={approveVetOnGenerate}
                    onChange={(e) => setApproveVetOnGenerate(e.target.checked)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('reports.approveVet')}</p>
                    <p className="text-xs text-gray-500">{userDisplayName}</p>
                  </div>
                  {approveVetOnGenerate && <CheckCircle2 size={20} className="text-green-600 shrink-0" />}
                </label>
              )}
              {!canApproveLab && !canApproveVet && (
                <p className="text-xs text-gray-500">{t('reports.pendingApproval')}</p>
              )}
            </div>

            {canRegeneratePdf && (
              <button type="button" onClick={generateReport} disabled={generating} className="btn-primary w-full py-3">
                {generating ? t('common.loading') : t('reports.generatePdf')}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
