import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Ban, Search, Check, ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import StatusBadge from '../components/ui/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { purchasesAPI, suppliersAPI } from '../services/api';
import PurchaseExtractionModal from './PurchaseExtractionModal';

const PAGE_SIZE = 20;
const TAX_CATEGORIES = ['standard', 'zero_rated', 'exempt', 'out_of_scope'];
const defaultCategory = (cash) => (cash ? 'out_of_scope' : 'standard');
const emptyItem = (cash = false) => ({
  description: '',
  quantity: 1,
  unit_price_sar: '',
  discount_sar: '',
  tax_category: defaultCategory(cash),
});
const emptyForm = {
  supplier_id: '',
  uses_cash_unregistered: false,
  supplier_invoice_number: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  payment_method: 'cash',
  notes: '',
  discount_sar: '',
  items: [emptyItem(false)],
};

const toHalalas = (sar) => Math.round(Number(sar || 0) * 100);
const fromHalalas = (h) => (Number(h || 0) / 100).toFixed(2);
const rateBpsOf = (category) => (category === 'standard' ? 1500 : 0);

const computeFormTotals = (form) => {
  const lineNets = form.items.map((line) => {
    const gross = Math.round(Number(line.quantity || 0) * toHalalas(line.unit_price_sar));
    return Math.max(0, gross - toHalalas(line.discount_sar));
  });
  const subtotal = lineNets.reduce((sum, value) => sum + value, 0);
  const discount = toHalalas(form.discount_sar);
  const allocs = lineNets.map(() => 0);
  if (discount > 0 && subtotal > 0) {
    let used = 0;
    lineNets.forEach((net, index) => {
      if (index === lineNets.length - 1) allocs[index] = discount - used;
      else {
        const share = Math.floor((discount * net) / subtotal);
        allocs[index] = share;
        used += share;
      }
    });
  }
  const summaryMap = new Map();
  let vat = 0;
  form.items.forEach((line, index) => {
    const category = TAX_CATEGORIES.includes(line.tax_category)
      ? line.tax_category
      : defaultCategory(form.uses_cash_unregistered);
    const rateBps = rateBpsOf(category);
    const taxable = Math.max(0, lineNets[index] - allocs[index]);
    const lineVat = Math.round((taxable * rateBps) / 10000);
    vat += lineVat;
    const key = `${category}:${rateBps}`;
    const current = summaryMap.get(key) || {
      tax_category: category,
      tax_rate: rateBps / 100,
      taxable_halalas: 0,
      vat_halalas: 0,
    };
    current.taxable_halalas += taxable;
    current.vat_halalas += lineVat;
    summaryMap.set(key, current);
  });
  return {
    subtotal,
    discount,
    vat,
    total: subtotal - discount + vat,
    tax_summary: [...summaryMap.values()],
  };
};

export default function Purchases() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('purchases.create');
  const canApprove = hasPermission('purchases.approve');
  const canCancel = hasPermission('purchases.cancel');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierHits, setSupplierHits] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState({ name: '', tax_number: '', phone: '' });
  const [approveRow, setApproveRow] = useState(null);
  const [approving, setApproving] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [file, setFile] = useState(null);

  const totals = useMemo(() => computeFormTotals(form), [form]);

  const load = () => {
    setLoading(true);
    purchasesAPI.list({ search: search.trim() || undefined, status: status || undefined, page, limit: PAGE_SIZE })
      .then(({ data }) => {
        setUnavailable(false);
        setItems(data.data || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
      })
      .catch((err) => {
        if (['PURCHASES_UNAVAILABLE', 'PURCHASES_MIGRATION_REQUIRED'].includes(err.response?.data?.error?.code) || err.response?.status === 503) {
          setUnavailable(true);
          setItems([]);
        } else {
          toast.error(err.response?.data?.error?.message || t('common.error'));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page, status]);

  const searchSuppliers = async (term) => {
    setSupplierQuery(term);
    if (!term.trim()) {
      setSupplierHits([]);
      return;
    }
    const looksLikeTax = /^\d{5,}$/.test(term.trim());
    const { data } = await suppliersAPI.search(looksLikeTax ? { tax_number: term.trim() } : { q: term.trim() });
    setSupplierHits(data.data || []);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSelectedSupplier(null);
    setFile(null);
    setFormOpen(true);
  };

  const openEdit = async (row) => {
    const { data } = await purchasesAPI.get(row.id);
    const invoice = data.data;
    setEditing(invoice);
    setDetail(invoice);
    setForm({
      supplier_id: invoice.supplier_id,
      uses_cash_unregistered: invoice.uses_cash_unregistered,
      supplier_invoice_number: invoice.supplier_invoice_number,
      invoice_date: String(invoice.invoice_date).slice(0, 10),
      payment_method: invoice.payment_method,
      notes: invoice.notes || '',
      discount_sar: fromHalalas(invoice.discount_halalas),
      items: (invoice.items || []).map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price_sar: line.unit_price_sar,
        discount_sar: line.discount_sar,
        tax_category: line.tax_category || defaultCategory(invoice.uses_cash_unregistered),
      })),
    });
    setSelectedSupplier({
      id: invoice.supplier_id,
      name: invoice.supplier_name,
      name_ar: invoice.supplier_name_ar,
      tax_number: invoice.supplier_tax_number,
    });
    setFile(null);
    setFormOpen(true);
  };

  const payload = () => ({
    supplier_id: form.uses_cash_unregistered ? null : form.supplier_id,
    uses_cash_unregistered: form.uses_cash_unregistered,
    supplier_invoice_number: form.supplier_invoice_number,
    invoice_date: form.invoice_date,
    payment_method: form.payment_method,
    notes: form.notes,
    discount_sar: Number(form.discount_sar || 0),
    items: form.items.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unit_price_sar: Number(line.unit_price_sar || 0),
      discount_sar: Number(line.discount_sar || 0),
      tax_category: line.tax_category || defaultCategory(form.uses_cash_unregistered),
    })),
  });

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const body = payload();
      const { data } = editing
        ? await purchasesAPI.update(editing.id, body)
        : await purchasesAPI.create(body);
      const saved = data.data;
      if (file && saved.id) await purchasesAPI.attach(saved.id, file);
      if (saved.warnings?.length) toast(t('purchases.similar'));
      toast.success(editing ? t('purchases.updated') : t('purchases.created'));
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const createQuick = async () => {
    if (!window.confirm(t('purchases.quickConfirm'))) return;
    try {
      const { data } = await suppliersAPI.createQuick({ ...quick, confirm: true });
      setSelectedSupplier(data.data);
      setForm({ ...form, supplier_id: data.data.id, uses_cash_unregistered: false });
      setQuickOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const columns = [
    { key: 'document_number', label: t('purchases.title') },
    { key: 'supplier_name_ar', label: t('purchases.supplier'), render: (r) => r.supplier_name_ar || r.supplier_name || '—' },
    { key: 'supplier_invoice_number', label: t('purchases.supplierInvoice') },
    { key: 'invoice_date', label: t('purchases.invoiceDate'), render: (r) => String(r.invoice_date).slice(0, 10) },
    { key: 'total_sar', label: t('purchases.total'), render: (r) => r.total_sar },
    {
      key: 'status',
      label: t('common.status'),
      render: (r) => <StatusBadge status={r.status === 'approved' ? 'issued' : r.status === 'cancelled' ? 'cancelled' : 'pending'} label={t(`purchases.${r.status}`)} />,
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex gap-2">
          {canCreate && r.status === 'draft' && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-primary-600 text-sm flex items-center gap-1">
                <Pencil size={14} /> {t('purchases.edit')}
              </button>
              <button type="button" onClick={async (e) => {
                e.stopPropagation();
                if (!window.confirm(t('purchases.deleteDraft'))) return;
                await purchasesAPI.remove(r.id);
                toast.success(t('purchases.updated'));
                load();
              }} className="text-red-500 text-sm">
                {t('purchases.deleteDraft')}
              </button>
            </>
          )}
          {canApprove && r.status === 'draft' && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setApproveRow(r); }} className="text-green-700 text-sm flex items-center gap-1">
              <Check size={14} /> {t('purchases.approve')}
            </button>
          )}
          {canCancel && r.status !== 'cancelled' && (
            <button type="button" onClick={async (e) => {
              e.stopPropagation();
              const reason = window.prompt(t('purchases.cancelReason')) || '';
              if (r.status === 'approved' && !reason.trim()) {
                toast.error(t('purchases.cancelReason'));
                return;
              }
              await purchasesAPI.cancel(r.id, { reason });
              toast.success(t('purchases.cancelledOk'));
              load();
            }} className="text-red-600 text-sm flex items-center gap-1">
              <Ban size={14} /> {t('purchases.cancelDoc')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{t('purchases.title')}</h1>
        {canCreate && !unavailable && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setExtractOpen(true)} className="btn-secondary flex items-center gap-2">
              <ScanLine size={18} /> {t('purchases.extract')}
            </button>
            <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> {t('purchases.add')}
            </button>
          </div>
        )}
      </div>

      {unavailable ? (
        <div className="card p-6 text-amber-800 bg-amber-50">{t('purchases.unavailable')}</div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative max-w-md flex-1">
              <Search size={16} className="absolute top-3 start-3 text-gray-400" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('purchases.searchPlaceholder')} className="input-field ps-9" />
            </div>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input-field w-40">
              <option value="">{t('common.filter')}</option>
              <option value="draft">{t('purchases.draft')}</option>
              <option value="approved">{t('purchases.approved')}</option>
              <option value="cancelled">{t('purchases.cancelled')}</option>
            </select>
          </div>
          <DataTable columns={columns} data={items} loading={loading} />
          {pagination.total > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                {t('purchases.showingCount', { shown: items.length, total: pagination.total })}
                {pagination.totalPages > 1 && <> · {t('purchases.pageOf', { page: pagination.page, totalPages: pagination.totalPages })}</>}
              </span>
              {pagination.totalPages > 1 && (
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary py-1 px-3" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('purchases.previous')}</button>
                  <button type="button" className="btn-secondary py-1 px-3" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}>{t('purchases.next')}</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {canCreate && (
        <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t('purchases.edit') : t('purchases.add')} size="lg">
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm text-amber-800 bg-amber-50 p-3 rounded">{t('purchases.ocrLater')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.uses_cash_unregistered} onChange={(e) => {
                const nextCash = e.target.checked;
                const from = defaultCategory(form.uses_cash_unregistered);
                const to = defaultCategory(nextCash);
                setForm({
                  ...form,
                  uses_cash_unregistered: nextCash,
                  supplier_id: nextCash ? '' : form.supplier_id,
                  items: form.items.map((line) => (
                    line.tax_category === from ? { ...line, tax_category: to } : line
                  )),
                });
              }} />
              {t('purchases.cashUnregistered')}
            </label>
            <p className="text-xs text-gray-500">{t('purchases.cashHint')}</p>
            {!form.uses_cash_unregistered && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('purchases.searchTax')}</label>
                <input value={supplierQuery} onChange={(e) => searchSuppliers(e.target.value)} className="input-field" />
                {selectedSupplier && (
                  <div className="mt-2 text-sm">{selectedSupplier.name_ar || selectedSupplier.name} {selectedSupplier.is_temporary ? `(${t('purchases.temporary')})` : ''}</div>
                )}
                {supplierHits.map((hit) => (
                  <button type="button" key={hit.id} className="block text-start text-sm py-1" onClick={() => { setSelectedSupplier(hit); setForm({ ...form, supplier_id: hit.id }); }}>
                    {hit.name_ar || hit.name} {hit.tax_number || ''}
                  </button>
                ))}
                <button type="button" className="text-primary-600 text-sm mt-2" onClick={() => setQuickOpen(true)}>{t('purchases.quickSupplier')}</button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input required value={form.supplier_invoice_number} onChange={(e) => setForm({ ...form, supplier_invoice_number: e.target.value })} className="input-field" placeholder={t('purchases.supplierInvoice')} />
              <input type="date" required value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} className="input-field" />
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="input-field">
                <option value="cash">{t('purchases.cash')}</option>
                <option value="bank_transfer">{t('purchases.bank_transfer')}</option>
                <option value="credit">{t('purchases.credit')}</option>
                <option value="other">{t('purchases.other')}</option>
              </select>
              <input value={form.discount_sar} onChange={(e) => setForm({ ...form, discount_sar: e.target.value })} className="input-field" placeholder={t('purchases.discount')} />
            </div>
            <div>
              <div className="font-medium mb-2">{t('purchases.items')}</div>
              {form.items.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 mb-2">
                  <input value={line.description} onChange={(e) => { const next = [...form.items]; next[index] = { ...line, description: e.target.value }; setForm({ ...form, items: next }); }} className="input-field col-span-12 md:col-span-4" placeholder={t('purchases.description')} required />
                  <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => { const next = [...form.items]; next[index] = { ...line, quantity: e.target.value }; setForm({ ...form, items: next }); }} className="input-field col-span-4 md:col-span-2" />
                  <input type="number" min="0" step="0.01" value={line.unit_price_sar} onChange={(e) => { const next = [...form.items]; next[index] = { ...line, unit_price_sar: e.target.value }; setForm({ ...form, items: next }); }} className="input-field col-span-4 md:col-span-2" placeholder={t('purchases.unitPrice')} />
                  <input type="number" min="0" step="0.01" value={line.discount_sar} onChange={(e) => { const next = [...form.items]; next[index] = { ...line, discount_sar: e.target.value }; setForm({ ...form, items: next }); }} className="input-field col-span-4 md:col-span-2" placeholder={t('purchases.lineDiscount')} />
                  <select value={line.tax_category || defaultCategory(form.uses_cash_unregistered)} onChange={(e) => { const next = [...form.items]; next[index] = { ...line, tax_category: e.target.value }; setForm({ ...form, items: next }); }} className="input-field col-span-12 md:col-span-2">
                    {TAX_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{t(`purchases.tax.${category}`)}</option>
                    ))}
                  </select>
                </div>
              ))}
              <button type="button" className="text-sm text-primary-600" onClick={() => setForm({ ...form, items: [...form.items, emptyItem(form.uses_cash_unregistered)] })}>{t('common.add')}</button>
              <p className="text-xs text-gray-500 mt-2">{t('purchases.taxHint')}</p>
            </div>
            <div className="text-sm space-y-1">
              <div>{t('purchases.subtotal')}: {fromHalalas(totals.subtotal)}</div>
              <div>{t('purchases.discount')}: {fromHalalas(totals.discount)}</div>
              <div className="font-medium">{t('purchases.taxSummary')}</div>
              {totals.tax_summary.map((row) => (
                <div key={`${row.tax_category}:${row.tax_rate}`}>
                  {t(`purchases.tax.${row.tax_category}`)} ({row.tax_rate}%): {fromHalalas(row.vat_halalas)}
                </div>
              ))}
              <div>{t('purchases.vat')}: {fromHalalas(totals.vat)}</div>
              <div className="font-bold">{t('purchases.total')}: {fromHalalas(totals.total)}</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('purchases.attachment')}</label>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-gray-500 mt-1">{t('purchases.uploadHint')}</p>
              {detail?.attachments?.[0] && (
                <button type="button" className="text-primary-600 text-sm" onClick={async () => {
                  const { data } = await purchasesAPI.attachment(detail.id, detail.attachments[0].id);
                  const url = URL.createObjectURL(data);
                  window.open(url, '_blank', 'noopener');
                }}>{detail.attachments[0].original_name}</button>
              )}
            </div>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-[70px]" placeholder={t('common.notes')} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>{t('common.cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}

      <Modal isOpen={quickOpen} onClose={() => setQuickOpen(false)} title={t('purchases.quickSupplier')}>
        <div className="space-y-3">
          <input className="input-field" placeholder={t('suppliers.nameEn')} value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} />
          <input className="input-field" placeholder={t('suppliers.taxNumber')} value={quick.tax_number} onChange={(e) => setQuick({ ...quick, tax_number: e.target.value })} />
          <input className="input-field" placeholder={t('suppliers.phone')} value={quick.phone} onChange={(e) => setQuick({ ...quick, phone: e.target.value })} />
          <button type="button" className="btn-primary" onClick={createQuick}>{t('common.save')}</button>
        </div>
      </Modal>

      <Modal isOpen={!!approveRow} onClose={() => setApproveRow(null)} title={t('purchases.approve')}>
        <p className="mb-4">{t('purchases.approveConfirm')}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={approving} onClick={() => setApproveRow(null)}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" disabled={approving} onClick={async () => {
            if (approving) return;
            setApproving(true);
            try {
              await purchasesAPI.approve(approveRow.id);
              toast.success(t('purchases.approvedOk'));
              setApproveRow(null);
              load();
            } catch (err) {
              toast.error(err.response?.data?.error?.message || t('common.error'));
            } finally {
              setApproving(false);
            }
          }}>{approving ? t('common.loading') : t('purchases.approve')}</button>
        </div>
      </Modal>
      <PurchaseExtractionModal
        open={extractOpen}
        onClose={() => setExtractOpen(false)}
        onCreated={() => { setExtractOpen(false); load(); }}
      />
    </div>
  );
}
