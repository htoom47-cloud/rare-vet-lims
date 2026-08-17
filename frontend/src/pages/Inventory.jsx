import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import Modal from '../components/ui/Modal';
import { inventoryAPI } from '../services/api';

const CATEGORIES = ['reagent', 'tube', 'slide', 'consumable', 'chemical', 'other'];
const PAGE_SIZE = 20;
const emptyAdjust = {
  type: 'in',
  quantity: '',
  notes: '',
  source: 'fefo',
  lot_id: '',
  lot_number: '',
  expiry_date: '',
};

const formatDate = (value) => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const date = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

export default function Inventory() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState({ low_stock: [], expiring_total: 0 });
  const [loading, setLoading] = useState(true);
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    sku: '', name: '', name_ar: '', category: 'reagent', unit: 'unit', quantity: 0, min_quantity: 0, lot_number: '', expiry_date: '', location: '',
  });
  const [adjustForm, setAdjustForm] = useState(emptyAdjust);
  const [legacyForm, setLegacyForm] = useState({ lot_number: '', expiry_date: '' });

  const load = () => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (expiringOnly) params.expiring = 'true';
    inventoryAPI.list(params).then(({ data }) => {
      setItems(data.data);
      setPagination(data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
    }).finally(() => setLoading(false));
    inventoryAPI.alerts().then(({ data }) => setAlerts(data.data));
  };

  useEffect(() => { load(); }, [expiringOnly, page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await inventoryAPI.create({ ...form, quantity: Number(form.quantity), min_quantity: Number(form.min_quantity), expiry_date: form.expiry_date || null });
      toast.success(t('inventory.itemAdded'));
      setCreateOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const openAdjust = async (row) => {
    try {
      const { data } = await inventoryAPI.get(row.inventory_item_id || row.id);
      const item = data.data;
      setSelected(item);
      setAdjustForm(emptyAdjust);
      setLegacyForm({
        lot_number: item.show_legacy_fields ? (item.legacy_lot_number || '') : '',
        expiry_date: item.show_legacy_fields ? formatDate(item.legacy_expiry_date) : '',
      });
      setAdjustOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        type: adjustForm.type,
        quantity: adjustForm.quantity,
        notes: adjustForm.notes || null,
      };
      if (adjustForm.type === 'out') {
        payload.source = adjustForm.source;
        payload.lot_id = adjustForm.source === 'lot' ? adjustForm.lot_id || null : null;
      } else {
        payload.lot_number = adjustForm.lot_number || null;
        payload.expiry_date = adjustForm.expiry_date || null;
      }
      await inventoryAPI.adjust(selected.id, payload);
      toast.success(t('inventory.stockUpdated'));
      setAdjustOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const handleSaveLegacy = async () => {
    if (!selected?.show_legacy_fields) return;
    try {
      await inventoryAPI.update(selected.id, {
        lot_number: legacyForm.lot_number || null,
        expiry_date: legacyForm.expiry_date || null,
      });
      const { data } = await inventoryAPI.get(selected.id);
      setSelected(data.data);
      toast.success(t('inventory.legacySaved'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const itemColumns = [
    { key: 'sku', label: t('inventory.sku') },
    { key: 'name', label: t('common.name') },
    { key: 'category', label: t('inventory.category') },
    { key: 'quantity', label: t('inventory.quantity'), render: (r) => (
      <span className={r.is_low_stock ? 'text-red-600 font-medium' : ''}>{r.quantity} {r.unit}</span>
    )},
    { key: 'lots_quantity', label: t('inventory.lotsOnHand'), render: (r) => r.lots_supported ? r.lots_quantity : '—' },
    { key: 'nearest_lot_expiry', label: t('inventory.nearestLotExpiry'), render: (r) => formatDate(r.nearest_lot_expiry) || '—' },
    { key: 'legacy_quantity', label: t('inventory.legacyUnallocated'), render: (r) => (
      r.show_legacy_fields
        ? `${r.legacy_quantity}${r.legacy_lot_number ? ` · ${r.legacy_lot_number}` : ''}${r.legacy_expiry_date ? ` · ${formatDate(r.legacy_expiry_date)}` : ''}`
        : '—'
    )},
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); openAdjust(r); }} className="text-primary-600 text-sm flex items-center gap-1">
        <PackagePlus size={14} /> {t('inventory.adjust')}
      </button>
    )},
  ];

  const expiringColumns = [
    { key: 'sku', label: t('inventory.sku') },
    { key: 'name', label: t('common.name') },
    { key: 'source', label: t('inventory.source'), render: (r) => (
      r.source === 'lot' ? t('inventory.alertSourceLot') : t('inventory.alertSourceLegacy')
    )},
    { key: 'lot_number', label: t('inventory.openingLegacyLot'), render: (r) => r.lot_number || (r.unlabeled ? t('inventory.unlabeledLot') : '—') },
    { key: 'remaining_quantity', label: t('inventory.remainingQuantity'), render: (r) => r.remaining_quantity ?? r.quantity },
    { key: 'expiry_date', label: t('inventory.expiryDate'), render: (r) => formatDate(r.expiry_date) || '—' },
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); openAdjust(r); }} className="text-primary-600 text-sm flex items-center gap-1">
        <PackagePlus size={14} /> {t('inventory.adjust')}
      </button>
    )},
  ];

  const lots = (selected?.lots || []).filter((lot) => Number(lot.quantity) > 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('inventory.title')}</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> {t('inventory.addItem')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard title={t('inventory.lowStock')} value={alerts.low_stock?.length || 0} icon={AlertTriangle} color="red" />
        <StatCard title={t('inventory.expiring')} value={alerts.expiring_total || 0} icon={AlertTriangle} color="orange" />
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('inventory.legacyLotsNote')}</p>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input
          type="checkbox"
          checked={expiringOnly}
          onChange={(e) => {
            setPage(1);
            setExpiringOnly(e.target.checked);
          }}
        />
        {t('inventory.filterExpiring')}
      </label>

      {pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm text-gray-600">
          <span>
            {t('inventory.showingCount', { shown: items.length, total: pagination.total })}
            {pagination.totalPages > 1 && <> · {t('inventory.pageOf', { page: pagination.page, totalPages: pagination.totalPages })}</>}
          </span>
          {pagination.totalPages > 1 && (
            <div className="flex gap-2">
              <button type="button" className="btn-secondary py-1 px-3" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('inventory.previous')}</button>
              <button type="button" className="btn-secondary py-1 px-3" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}>{t('inventory.next')}</button>
            </div>
          )}
        </div>
      )}

      <DataTable columns={expiringOnly ? expiringColumns : itemColumns} data={items} loading={loading} />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('inventory.addItem')} size="lg">
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'sku', label: t('inventory.sku') },
            { key: 'name', label: t('common.name') },
            { key: 'name_ar', label: t('inventory.nameAr') },
            { key: 'location', label: t('inventory.location') },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="input-field" required={['sku', 'name'].includes(f.key)} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.category')}</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.quantity')}</label>
            <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.minQuantity')}</label>
            <input type="number" min="0" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} className="input-field" />
          </div>
          <div className="md:col-span-2 text-xs text-gray-600">{t('inventory.openingLegacyHint')}</div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.openingLegacyLot')}</label>
            <input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.openingLegacyExpiry')}</label>
            <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="input-field" />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title={t('inventory.adjustTitle', { name: selected?.name || '' })}>
        <form onSubmit={handleAdjust} className="space-y-4">
          {selected?.lots_supported && (
            <div className="text-xs text-gray-600 space-y-1 bg-gray-50 dark:bg-gray-900/40 p-3 rounded">
              <div>{t('inventory.quantity')}: {selected.quantity}</div>
              <div>{t('inventory.lotsOnHand')}: {selected.lots_quantity}</div>
              <div>{t('inventory.legacyUnallocated')}: {selected.legacy_quantity}</div>
            </div>
          )}
          {selected?.show_legacy_fields ? (
            <fieldset className="border border-amber-200 dark:border-amber-900 rounded p-3 space-y-2">
              <legend className="text-sm font-medium px-1">{t('inventory.legacyFieldsLabel')}</legend>
              <p className="text-xs text-gray-600">{t('inventory.legacyFieldsHint')}</p>
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.openingLegacyLot')}</label>
                <input value={legacyForm.lot_number} onChange={(e) => setLegacyForm({ ...legacyForm, lot_number: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.openingLegacyExpiry')}</label>
                <input type="date" value={legacyForm.expiry_date} onChange={(e) => setLegacyForm({ ...legacyForm, expiry_date: e.target.value })} className="input-field" />
              </div>
              <button type="button" onClick={handleSaveLegacy} className="btn-secondary text-sm">{t('inventory.saveLegacyFields')}</button>
            </fieldset>
          ) : selected?.lots_supported ? (
            <p className="text-xs text-gray-500">{t('inventory.legacyFieldsLabel')}: —</p>
          ) : null}
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.adjustType')}</label>
            <select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })} className="input-field">
              <option value="in">{t('inventory.adjustIn')}</option>
              <option value="out">{t('inventory.adjustOut')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('inventory.quantity')}</label>
            <input type="number" min="0.001" step="0.001" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} className="input-field" required />
          </div>
          {adjustForm.type === 'out' && selected?.lots_supported && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">{t('inventory.source')}</label>
                <select value={adjustForm.source} onChange={(e) => setAdjustForm({ ...adjustForm, source: e.target.value })} className="input-field">
                  <option value="fefo">{t('inventory.sourceFefo')}</option>
                  <option value="lot">{t('inventory.sourceLot')}</option>
                  <option value="legacy">{t('inventory.sourceLegacy')}</option>
                </select>
              </div>
              {adjustForm.source === 'lot' && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inventory.lotRequired')}</label>
                  <select required value={adjustForm.lot_id} onChange={(e) => setAdjustForm({ ...adjustForm, lot_id: e.target.value })} className="input-field">
                    <option value="">{t('inventory.lotRequired')}</option>
                    {lots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.unlabeled ? t('inventory.unlabeledLot') : lot.lot_number}
                        {lot.expiry_date ? ` · ${formatDate(lot.expiry_date)}` : ''}
                        {` · ${lot.quantity}`}
                      </option>
                    ))}
                  </select>
                  {lots.length === 0 && <p className="text-xs text-gray-500 mt-1">{t('inventory.noPositiveLots')}</p>}
                </div>
              )}
            </>
          )}
          {adjustForm.type === 'in' && selected?.lots_supported && (
            <>
              <p className="text-xs text-gray-600">{t('inventory.inLotHint')}</p>
              <div>
                <label className="block text-sm font-medium mb-1">{t('purchases.lotNumber')}</label>
                <input value={adjustForm.lot_number} onChange={(e) => setAdjustForm({ ...adjustForm, lot_number: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('purchases.expiryDate')}</label>
                <input type="date" value={adjustForm.expiry_date} onChange={(e) => setAdjustForm({ ...adjustForm, expiry_date: e.target.value })} className="input-field" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
            <input value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdjustOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('inventory.updateStock')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
