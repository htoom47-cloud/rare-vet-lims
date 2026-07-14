import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { animalsAPI, customersAPI } from '../services/api';
import { useAnimalSpecies } from '../hooks/useAnimalSpecies';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;
const GENDERS = ['male', 'female', 'unknown'];

const EMPTY_FORM = {
  animal_type: 'camel',
  gender: 'unknown',
  age: '',
  name_tag: '',
  breed: '',
  color: '',
  weight: '',
  rfid_chip: '',
  owner_id: '',
  medical_history: '',
};

export default function Animals() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('animals.update');
  const { codes, label } = useAnimalSpecies();
  const isAr = i18n.language === 'ar';
  const [animals, setAnimals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const load = () => {
    setLoading(true);
    animalsAPI.list({ search, page, limit: PAGE_SIZE })
      .then(({ data }) => {
        setAnimals(data.data || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    customersAPI.list({ limit: 100 }).then(({ data }) => setCustomers(data.data || []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (animal) => {
    setEditingId(animal.id);
    setForm({
      animal_type: animal.animal_type || 'camel',
      gender: animal.gender || 'unknown',
      age: animal.age || '',
      name_tag: animal.name_tag || '',
      breed: animal.breed || '',
      color: animal.color || '',
      weight: animal.weight ?? '',
      rfid_chip: animal.rfid_chip || '',
      owner_id: animal.owner_id || '',
      medical_history: animal.medical_history || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, weight: form.weight !== '' && form.weight != null ? parseFloat(form.weight) : null };
    try {
      if (editingId) {
        await animalsAPI.update(editingId, payload);
        toast.success(t('animals.updated'));
      } else {
        await animalsAPI.create(payload);
        toast.success(t('animals.created'));
      }
      closeModal();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const columns = [
    { key: 'animal_code', label: t('animals.animalId') },
    { key: 'animal_type', label: t('animals.type'), render: (r) => label(r.animal_type, isAr) },
    { key: 'name_tag', label: t('animals.name') },
    { key: 'breed', label: t('animals.breed') },
    { key: 'gender', label: t('animals.gender'), render: (r) => t(`animals.genders.${r.gender}`, { defaultValue: r.gender }) },
    { key: 'owner_name', label: t('animals.owner') },
    { key: 'rfid_chip', label: t('animals.rfid') },
    ...(canEdit ? [{
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openEdit(r); }}
          className="text-primary-600 text-sm hover:underline inline-flex items-center gap-1"
        >
          <Pencil size={14} /> {t('common.edit')}
        </button>
      ),
    }] : []),
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{t('animals.title')}</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('common.search')}
              className="input-field ps-10"
            />
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('common.add')}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={animals} loading={loading} />

      {pagination.total > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            {isAr
              ? `عرض ${animals.length} من ${pagination.total}`
              : `Showing ${animals.length} of ${pagination.total}`}
            {pagination.totalPages > 1 && (
              <> · {isAr ? `صفحة ${pagination.page} / ${pagination.totalPages}` : `Page ${pagination.page} / ${pagination.totalPages}`}</>
            )}
          </span>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary py-1 px-3 disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {isAr ? 'السابق' : 'Previous'}
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-3 disabled:opacity-40"
                disabled={page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? t('animals.editAnimal') : t('animals.addAnimal')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">{t('animals.owner')}</label>
            <select value={form.owner_id} onChange={(e) => setField('owner_id', e.target.value)} className="input-field" required>
              <option value="">{t('animals.selectOwner')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.type')}</label>
            <select value={form.animal_type} onChange={(e) => setField('animal_type', e.target.value)} className="input-field">
              {codes.map((type) => <option key={type} value={type}>{label(type, isAr)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.gender')}</label>
            <select value={form.gender} onChange={(e) => setField('gender', e.target.value)} className="input-field">
              {GENDERS.map((g) => <option key={g} value={g}>{t(`animals.genders.${g}`)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.age')}</label>
            <input value={form.age} onChange={(e) => setField('age', e.target.value)} className="input-field" placeholder={t('animals.agePlaceholder')} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.name')}</label>
            <input value={form.name_tag} onChange={(e) => setField('name_tag', e.target.value)} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.breed')}</label>
            <input value={form.breed} onChange={(e) => setField('breed', e.target.value)} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.color')}</label>
            <input value={form.color} onChange={(e) => setField('color', e.target.value)} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.rfid')}</label>
            <input value={form.rfid_chip} onChange={(e) => setField('rfid_chip', e.target.value)} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('animals.weight')}</label>
            <input value={form.weight} onChange={(e) => setField('weight', e.target.value)} className="input-field" type="number" step="0.1" min="0" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">{t('animals.medicalHistory')}</label>
            <textarea value={form.medical_history} onChange={(e) => setField('medical_history', e.target.value)} className="input-field" rows={2} />
          </div>

          <div className="md:col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={closeModal} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
