import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, FileText, FilePlus, Sparkles, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { reportsAPI, samplesAPI, notificationsAPI } from '../services/api';

export default function Reports() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [completedSamples, setCompletedSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  const [selectedSample, setSelectedSample] = useState(null);
  const [language, setLanguage] = useState('ar');
  const [treatment, setTreatment] = useState('');
  const [aiPreview, setAiPreview] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  const load = () => {
    setLoading(true);
    reportsAPI.list().then(({ data }) => setReports(data.data)).finally(() => setLoading(false));
    samplesAPI.list({ status: 'completed', limit: 50 }).then(({ data }) => setCompletedSamples(data.data));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const sampleId = searchParams.get('generate');
    if (!sampleId || !completedSamples.length) return;
    const sample = completedSamples.find((s) => s.id === sampleId);
    if (sample) openGenerateForSample(sample);
  }, [searchParams, completedSamples]);

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
      await notificationsAPI.sendReport(report.sample_id, 'sms');
      toast.success(t('workflow.sentToCustomer'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setSendingId(null);
    }
  };

  const openPdf = async (pdfUrl) => {
    try {
      await reportsAPI.openPdf(pdfUrl);
    } catch {
      toast.error(t('reports.openFailed'));
    }
  };

  const openGenerateForSample = async (sample) => {
    setSelectedSample(sample);
    setTreatment('');
    setLanguage('ar');
    setAiPreview('');
    setGenerateOpen(true);
    setLoadingAi(true);
    try {
      const { data } = await reportsAPI.interpret(sample.id, 'ar');
      setAiPreview(data.data.interpretation);
    } catch {
      setAiPreview('');
    } finally {
      setLoadingAi(false);
    }
  };

  const reloadAiPreview = async (lang) => {
    if (!selectedSample) return;
    setLoadingAi(true);
    try {
      const { data } = await reportsAPI.interpret(selectedSample.id, lang);
      setAiPreview(data.data.interpretation);
    } catch {
      toast.error(t('reports.aiFailed'));
    } finally {
      setLoadingAi(false);
    }
  };

  const generateReport = async () => {
    if (!selectedSample) return;
    setGenerating(true);
    try {
      const { data } = await reportsAPI.generate(selectedSample.id, {
        language,
        treatment_recommendations: treatment,
      });
      toast.success(`${t('reports.created')} ${data.data.report_number}`);
      setGenerateOpen(false);
      setSelectedSample(null);
      load();
      if (data.data.pdf_url) await reportsAPI.openPdf(data.data.pdf_url);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('reports.generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const columns = [
    { key: 'report_number', label: t('reports.reportNo') },
    { key: 'sample_code', label: t('reports.sampleNo') },
    { key: 'customer_name', label: t('customers.fullName') },
    { key: 'language', label: t('reports.language'), render: (r) => (r.language === 'ar' ? 'عربي' : 'EN') },
    { key: 'created_at', label: t('common.date'), render: (r) => new Date(r.created_at).toLocaleDateString() },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex gap-2">
          {r.pdf_url && (
            <button type="button" onClick={(e) => { e.stopPropagation(); openPdf(r.pdf_url); }} className="text-primary-600 flex items-center gap-1 text-sm">
              <Download size={14} /> {t('common.print')}
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); sendToCustomer(r); }} disabled={sendingId === r.id} className="text-green-600 text-sm">
            {t('workflow.sendToCustomer')}
          </button>
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
        <button onClick={() => { setSelectedSample(null); setGenerateOpen(true); }} className="btn-primary flex items-center gap-2">
          <FilePlus size={18} /> {t('reports.generate')}
        </button>
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
              <button type="button" onClick={() => { setLanguage('ar'); reloadAiPreview('ar'); }} className={`flex-1 py-2 rounded-lg text-sm ${language === 'ar' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>عربي</button>
              <button type="button" onClick={() => { setLanguage('en'); reloadAiPreview('en'); }} className={`flex-1 py-2 rounded-lg text-sm ${language === 'en' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}>English</button>
            </div>

            <div className="border border-primary-300/50 rounded-lg overflow-hidden">
              <div className="bg-primary-600 text-white px-3 py-2 text-sm font-medium flex items-center gap-2">
                <Sparkles size={16} /> {t('reports.aiSection')}
              </div>
              <div className="p-3 text-sm bg-primary-50 dark:bg-primary-900/10 min-h-[100px] whitespace-pre-wrap">
                {loadingAi ? t('common.loading') : (aiPreview || t('reports.aiEmpty'))}
              </div>
              <p className="text-xs text-primary-500 px-3 py-2 bg-primary-50/50">{t('reports.aiHint')}</p>
            </div>

            <div className="border border-primary-300/50 rounded-lg overflow-hidden">
              <div className="bg-primary-400 text-white px-3 py-2 text-sm font-medium flex items-center gap-2">
                <Stethoscope size={16} /> {t('reports.treatmentSection')}
              </div>
              <textarea
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                className="input-field border-0 rounded-none min-h-[120px]"
                placeholder={t('reports.treatmentPlaceholder')}
                rows={5}
              />
              <p className="text-xs text-primary-500 px-3 py-2 bg-primary-50/50">{t('reports.treatmentHint')}</p>
            </div>

            <button type="button" onClick={generateReport} disabled={generating} className="btn-primary w-full py-3">
              {generating ? t('common.loading') : t('reports.generatePdf')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
