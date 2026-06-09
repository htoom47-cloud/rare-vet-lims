import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { qualityAPI } from '../services/api';

export default function Quality() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('qc');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({});

  const tabs = [
    { id: 'qc', label: t('quality.qc'), load: () => qualityAPI.qc() },
    { id: 'maintenance', label: t('quality.maintenance'), load: () => qualityAPI.maintenance() },
    { id: 'calibrations', label: t('quality.calibration'), load: () => qualityAPI.calibrations() },
    { id: 'temperature', label: t('quality.temperature'), load: () => qualityAPI.temperature() },
  ];

  const load = () => {
    setLoading(true);
    const current = tabs.find((tb) => tb.id === tab);
    current.load().then(({ data: res }) => {
      setData(res.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab]);

  const openAdd = () => {
    if (tab === 'temperature') setForm({ location: 'ثلاجة العينات', temperature: 4, humidity: 60 });
    else if (tab === 'maintenance') setForm({ device_name: '', maintenance_type: 'صيانة دورية', description: '' });
    else if (tab === 'calibrations') setForm({ device_name: '', result: 'pass', notes: '' });
    else setForm({ device_name: '', expected_value: 0, actual_value: 0, status: 'pass' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (tab === 'temperature') await qualityAPI.createTemperature(form);
      else if (tab === 'maintenance') await qualityAPI.createMaintenance(form);
      else if (tab === 'calibrations') await qualityAPI.createCalibration(form);
      else await qualityAPI.createQC(form);
      toast.success('تم الحفظ');
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const getColumns = () => {
    switch (tab) {
      case 'qc':
        return [
          { key: 'test_name', label: 'الفحص' },
          { key: 'expected_value', label: 'المتوقع' },
          { key: 'actual_value', label: 'الفعلي' },
          { key: 'status', label: t('common.status') },
          { key: 'performed_at', label: t('common.date'), render: (r) => new Date(r.performed_at).toLocaleDateString() },
        ];
      case 'maintenance':
        return [
          { key: 'device_name', label: 'الجهاز' },
          { key: 'maintenance_type', label: 'النوع' },
          { key: 'status', label: t('common.status') },
          { key: 'next_due_date', label: 'الموعد القادم' },
        ];
      case 'calibrations':
        return [
          { key: 'device_name', label: 'الجهاز' },
          { key: 'result', label: 'النتيجة' },
          { key: 'next_calibration', label: 'المعايرة القادمة' },
          { key: 'calibration_date', label: t('common.date'), render: (r) => new Date(r.calibration_date).toLocaleDateString() },
        ];
      default:
        return [
          { key: 'location', label: 'الموقع' },
          { key: 'temperature', label: 'الحرارة °C', render: (r) => <span className={r.is_alert ? 'text-red-600 font-bold' : ''}>{r.temperature}°C</span> },
          { key: 'humidity', label: 'الرطوبة', render: (r) => r.humidity ? `${r.humidity}%` : '-' },
          { key: 'recorded_at', label: t('common.date'), render: (r) => new Date(r.recorded_at).toLocaleString() },
        ];
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('quality.title')}</h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> {t('common.add')}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === tb.id ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
            {tb.label}
          </button>
        ))}
      </div>
      <DataTable columns={getColumns()} data={Array.isArray(data) ? data : []} loading={loading} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('common.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'temperature' && (
            <>
              <div><label className="block text-sm font-medium mb-1">الموقع</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input-field" required /></div>
              <div><label className="block text-sm font-medium mb-1">الحرارة °C</label><input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} className="input-field" required /></div>
              <div><label className="block text-sm font-medium mb-1">الرطوبة %</label><input type="number" value={form.humidity} onChange={(e) => setForm({ ...form, humidity: e.target.value })} className="input-field" /></div>
            </>
          )}
          {(tab === 'maintenance' || tab === 'calibrations' || tab === 'qc') && (
            <div><label className="block text-sm font-medium mb-1">اسم الجهاز</label><input value={form.device_name} onChange={(e) => setForm({ ...form, device_name: e.target.value })} className="input-field" required /></div>
          )}
          {tab === 'qc' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">المتوقع</label><input type="number" value={form.expected_value} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} className="input-field" /></div>
                <div><label className="block text-sm font-medium mb-1">الفعلي</label><input type="number" value={form.actual_value} onChange={(e) => setForm({ ...form, actual_value: e.target.value })} className="input-field" /></div>
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
