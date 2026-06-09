import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { animalsAPI, customersAPI } from '../services/api';

const ANIMAL_TYPES = ['camel', 'horse', 'sheep', 'goat', 'bird', 'cat', 'dog'];
const GENDERS = ['male', 'female', 'unknown'];

export default function Animals() {
  const { t } = useTranslation();
  const [animals, setAnimals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    animal_type: 'camel', name_tag: '', age: '', gender: 'unknown', weight: '', color: '', rfid_chip: '', owner_id: '', medical_history: '',
  });

  const load = () => {
    setLoading(true);
    animalsAPI.list({ search }).then(({ data }) => setAnimals(data.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    customersAPI.list({ limit: 100 }).then(({ data }) => setCustomers(data.data));
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await animalsAPI.create({ ...form, weight: form.weight ? parseFloat(form.weight) : null });
      toast.success('Animal registered');
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    }
  };

  const columns = [
    { key: 'animal_code', label: t('animals.animalId') },
    { key: 'animal_type', label: t('animals.type'), render: (r) => t(`animals.types.${r.animal_type}`) },
    { key: 'name_tag', label: t('animals.tag') },
    { key: 'gender', label: t('animals.gender') },
    { key: 'owner_name', label: t('animals.owner') },
    { key: 'rfid_chip', label: t('animals.rfid') },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{t('animals.title')}</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input-field ps-10" />
          </div>
          <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('common.add')}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={animals} loading={loading} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('common.add')} size="lg">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.type')}</label>
            <select value={form.animal_type} onChange={(e) => setForm({ ...form, animal_type: e.target.value })} className="input-field">
              {ANIMAL_TYPES.map((type) => <option key={type} value={type}>{t(`animals.types.${type}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.owner')}</label>
            <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className="input-field" required>
              <option value="">Select owner</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          {['name_tag', 'age', 'color', 'rfid_chip', 'weight'].map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1">{t(`animals.${field === 'name_tag' ? 'tag' : field === 'rfid_chip' ? 'rfid' : field}`)}</label>
              <input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="input-field" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.gender')}</label>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="input-field">
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">{t('animals.medicalHistory')}</label>
            <textarea value={form.medical_history} onChange={(e) => setForm({ ...form, medical_history: e.target.value })} className="input-field" rows={2} />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
