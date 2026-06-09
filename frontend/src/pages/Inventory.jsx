import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import Modal from '../components/ui/Modal';
import { inventoryAPI } from '../services/api';

const CATEGORIES = ['reagent', 'tube', 'slide', 'consumable', 'chemical', 'other'];

export default function Inventory() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState({ low_stock: [], expiring: [] });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    sku: '', name: '', name_ar: '', category: 'reagent', unit: 'unit', quantity: 0, min_quantity: 0, lot_number: '', expiry_date: '', location: '',
  });
  const [adjustForm, setAdjustForm] = useState({ type: 'in', quantity: 0, notes: '' });

  const load = () => {
    setLoading(true);
    inventoryAPI.list().then(({ data }) => setItems(data.data)).finally(() => setLoading(false));
    inventoryAPI.alerts().then(({ data }) => setAlerts(data.data));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await inventoryAPI.create({ ...form, quantity: Number(form.quantity), min_quantity: Number(form.min_quantity), expiry_date: form.expiry_date || null });
      toast.success('تم إضافة الصنف');
      setCreateOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    try {
      await inventoryAPI.adjust(selected.id, { ...adjustForm, quantity: Number(adjustForm.quantity) });
      toast.success('تم تحديث المخزون');
      setAdjustOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const columns = [
    { key: 'sku', label: t('inventory.sku') },
    { key: 'name', label: t('common.name') },
    { key: 'category', label: 'الفئة' },
    { key: 'quantity', label: t('inventory.quantity'), render: (r) => (
      <span className={r.is_low_stock ? 'text-red-600 font-medium' : ''}>{r.quantity} {r.unit}</span>
    )},
    { key: 'lot_number', label: 'رقم الدفعة' },
    { key: 'expiry_date', label: 'الانتهاء', render: (r) => r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : '-' },
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); setSelected(r); setAdjustForm({ type: 'in', quantity: 0, notes: '' }); setAdjustOpen(true); }} className="text-primary-600 text-sm flex items-center gap-1">
        <PackagePlus size={14} /> تعديل
      </button>
    )},
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('inventory.title')}</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> صنف جديد
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard title={t('inventory.lowStock')} value={alerts.low_stock?.length || 0} icon={AlertTriangle} color="red" />
        <StatCard title={t('inventory.expiring')} value={alerts.expiring?.length || 0} icon={AlertTriangle} color="orange" />
      </div>

      <DataTable columns={columns} data={items} loading={loading} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="صنف جديد" size="lg">
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'الاسم' },
            { key: 'name_ar', label: 'الاسم بالعربي' },
            { key: 'lot_number', label: 'رقم الدفعة' },
            { key: 'location', label: 'الموقع' },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="input-field" required={['sku', 'name'].includes(f.key)} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">الفئة</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الكمية</label>
            <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الحد الأدنى</label>
            <input type="number" min="0" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">تاريخ الانتهاء</label>
            <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="input-field" />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title={`تعديل مخزون - ${selected?.name}`}>
        <form onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">نوع الحركة</label>
            <select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })} className="input-field">
              <option value="in">إضافة (+)</option>
              <option value="out">صرف (-)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الكمية</label>
            <input type="number" min="0.01" step="0.01" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
            <input value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdjustOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">تحديث</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
