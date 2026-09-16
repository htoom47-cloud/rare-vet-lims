import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Ban, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import StatusBadge from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { suppliersAPI } from '../services/api';

const PAGE_SIZE = 20;

const emptyForm = {
  name: '',
  name_ar: '',
  tax_number: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  is_active: true,
};

export default function Suppliers() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('suppliers.manage');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    suppliersAPI.list({ search: search.trim() || undefined, page, limit: PAGE_SIZE })
      .then(({ data }) => {
        setUnavailable(false);
        setItems(data.data || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
      })
      .catch((err) => {
        if (err.response?.data?.error?.code === 'SUPPLIERS_UNAVAILABLE' || err.response?.status === 503) {
          setUnavailable(true);
          setItems([]);
          setPagination({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
        } else {
          toast.error(err.response?.data?.error?.message || t('common.error'));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = async (row) => {
    try {
      const { data } = await suppliersAPI.get(row.id);
      const supplier = data.data;
      setEditing(supplier);
      setForm({
        name: supplier.name || '',
        name_ar: supplier.name_ar || '',
        tax_number: supplier.tax_number || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        is_active: supplier.is_active !== false,
      });
      setFormOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await suppliersAPI.update(editing.id, form);
        toast.success(t('suppliers.updated'));
      } else {
        await suppliersAPI.create(form);
        toast.success(t('suppliers.created'));
      }
      setFormOpen(false);
      load();
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'DUPLICATE_TAX_NUMBER') toast.error(t('suppliers.duplicateTax'));
      else if (code === 'SUPPLIERS_UNAVAILABLE') toast.error(t('suppliers.unavailable'));
      else toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const disable = async (row) => {
    if (row.deleted_at) return;
    if (!window.confirm(t('suppliers.disableConfirm'))) return;
    try {
      await suppliersAPI.disable(row.id);
      toast.success(t('suppliers.disabled'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const columns = [
    { key: 'supplier_number', label: t('suppliers.number') },
    { key: 'name_ar', label: t('suppliers.nameAr') },
    { key: 'name', label: t('suppliers.nameEn') },
    { key: 'tax_number', label: t('suppliers.taxNumber'), render: (r) => r.tax_number || '—' },
    { key: 'phone', label: t('suppliers.phone'), render: (r) => r.phone || '—' },
    {
      key: 'is_active',
      label: t('common.status'),
      render: (r) => (
        <StatusBadge
          status={r.is_active ? 'issued' : 'cancelled'}
          label={r.is_active ? t('suppliers.active') : t('suppliers.inactive')}
        />
      ),
    },
    canManage ? {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        r.deleted_at ? (
          <span className="text-gray-500 text-sm">{t('suppliers.alreadyDisabled')}</span>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-primary-600 text-sm flex items-center gap-1">
              <Pencil size={14} /> {t('suppliers.edit')}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); disable(r); }} className="text-red-600 text-sm flex items-center gap-1">
              <Ban size={14} /> {t('suppliers.disable')}
            </button>
          </div>
        )
      ),
    } : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{t('suppliers.title')}</h1>
        {canManage && !unavailable && (
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('suppliers.add')}
          </button>
        )}
      </div>

      {unavailable ? (
        <div className="card p-6 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30">
          {t('suppliers.unavailable')}
        </div>
      ) : (
        <>
          <div className="mb-4 relative max-w-md">
            <Search size={16} className="absolute top-3 start-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('suppliers.searchPlaceholder')}
              className="input-field ps-9"
            />
          </div>
          <DataTable columns={columns} data={items} loading={loading} />
          {pagination.total > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
              <span>
                {t('suppliers.showingCount', { shown: items.length, total: pagination.total })}
                {pagination.totalPages > 1 && (
                  <> · {t('suppliers.pageOf', { page: pagination.page, totalPages: pagination.totalPages })}</>
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
                    {t('suppliers.previous')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary py-1 px-3 disabled:opacity-40"
                    disabled={page >= pagination.totalPages || loading}
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  >
                    {t('suppliers.next')}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {canManage && (
        <Modal
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          title={editing ? t('suppliers.edit') : t('suppliers.add')}
          size="lg"
        >
          <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {editing && (
              <div className="md:col-span-2 text-sm text-gray-500">
                {t('suppliers.number')}: <strong>{editing.supplier_number}</strong>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">{t('suppliers.nameEn')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('suppliers.nameAr')}</label>
              <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('suppliers.taxNumber')}</label>
              <input value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('suppliers.phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('suppliers.email')}</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">{t('suppliers.address')}</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">{t('suppliers.notes')}</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[80px]" />
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                {t('suppliers.active')}
              </label>
            )}
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
