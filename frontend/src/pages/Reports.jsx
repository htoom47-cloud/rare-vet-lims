import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, FilePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { reportsAPI, samplesAPI, notificationsAPI } from '../services/api';

export default function Reports() {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [completedSamples, setCompletedSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  const load = () => {
    setLoading(true);
    reportsAPI.list().then(({ data }) => setReports(data.data)).finally(() => setLoading(false));
    samplesAPI.list({ status: 'completed', limit: 50 }).then(({ data }) => setCompletedSamples(data.data));
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async () => {
    try {
      const { data } = await reportsAPI.verify(verifyCode);
      setVerifyResult(data.data);
      toast.success('التقرير صالح');
    } catch {
      toast.error('رمز التحقق غير صحيح');
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

  const generateReport = async (sampleId, lang) => {
    setGenerating(true);
    try {
      const { data } = await reportsAPI.generate(sampleId, lang);
      toast.success(`تم إنشاء التقرير ${data.data.report_number}`);
      setGenerateOpen(false);
      load();
      if (data.data.pdf_url) window.open(data.data.pdf_url, '_blank');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'تأكد من اعتماد جميع النتائج أولاً');
    } finally {
      setGenerating(false);
    }
  };

  const columns = [
    { key: 'report_number', label: 'رقم التقرير' },
    { key: 'sample_code', label: 'رقم العينة' },
    { key: 'customer_name', label: t('customers.fullName') },
    { key: 'language', label: 'اللغة', render: (r) => r.language === 'ar' ? 'عربي' : 'English' },
    { key: 'created_at', label: t('common.date'), render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <div className="flex gap-2">
        {r.pdf_url && (
          <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-primary-600 flex items-center gap-1 text-sm">
            <Download size={14} /> {t('common.download')}
          </a>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); sendToCustomer(r); }}
          disabled={sendingId === r.id}
          className="text-green-600 text-sm"
        >
          {t('workflow.sendToCustomer')}
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <button onClick={() => setGenerateOpen(true)} className="btn-primary flex items-center gap-2">
          <FilePlus size={18} /> {t('reports.generate')}
        </button>
      </div>

      <div className="card mb-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText size={18} /> {t('reports.verify')}</h3>
        <div className="flex gap-2">
          <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="أدخل رقم التقرير أو رمز QR" className="input-field flex-1" />
          <button onClick={handleVerify} className="btn-primary">تحقق</button>
        </div>
        {verifyResult && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
            <p className="text-green-700 dark:text-green-400 font-medium">✓ تقرير صالح</p>
            <p>التقرير: {verifyResult.report_number} | العينة: {verifyResult.sample_code}</p>
            <p>العميل: {verifyResult.customer_name}</p>
          </div>
        )}
      </div>

      <DataTable columns={columns} data={reports} loading={loading} />

      <Modal isOpen={generateOpen} onClose={() => setGenerateOpen(false)} title={t('reports.generate')} size="lg">
        <p className="text-sm text-gray-500 mb-4">اختر عينة مكتملة ومعتمدة لإنشاء تقرير PDF</p>
        {completedSamples.length === 0 ? (
          <p className="text-center text-gray-500 py-8">لا توجد عينات مكتملة</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {completedSamples.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div>
                  <p className="font-mono font-medium">{s.sample_code}</p>
                  <p className="text-sm text-gray-500">{s.customer_name} — {s.animal_code}</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={generating} onClick={() => generateReport(s.id, 'ar')} className="btn-secondary text-xs py-1 px-2">عربي</button>
                  <button disabled={generating} onClick={() => generateReport(s.id, 'en')} className="btn-primary text-xs py-1 px-2">EN</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
