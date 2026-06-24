import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Plus, CreditCard, Download, Printer, BarChart3, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import CustomerSearch from '../components/customers/CustomerSearch';
import { billingAPI, testsAPI } from '../services/api';

function groupItemsByAnimal(items, t) {
  const groups = new Map();
  for (const item of items || []) {
    const key = item.animal_id || '__general__';
    if (!groups.has(key)) {
      groups.set(key, {
        animal_id: item.animal_id,
        name_tag: item.name_tag,
        animal_type: item.animal_type,
        animal_code: item.animal_code,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    label: g.animal_id
      ? t('billing.animalLabel', {
          type: t(`animals.types.${g.animal_type}`, { defaultValue: g.animal_type }),
          tag: g.name_tag || g.animal_code || '—',
        })
      : t('billing.generalItems'),
  }));
}

export default function Billing() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canPay = hasPermission('billing.payment');
  const [invoices, setInvoices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('invoices');
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: '', sample_id: '', discount_amount: 0, notes: '', items: [],
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '', method: 'cash', reference_number: '', notes: '',
  });
  const [newItem, setNewItem] = useState({ test_id: '', description: '', quantity: 1, unit_price: 0 });

  const [pdfLoading, setPdfLoading] = useState(false);

  const paymentMethodLabel = (method) => t(`billing.paymentMethods.${method}`, { defaultValue: method });

  const load = () => {
    setLoading(true);
    billingAPI.invoices().then(({ data }) => setInvoices(data.data)).finally(() => setLoading(false));
    billingAPI.packages().then(({ data }) => setPackages(data.data));
  };

  useEffect(() => {
    load();
    testsAPI.list({ limit: 200 }).then(({ data }) => setTests(data.data));
  }, []);

  const openInvoiceDetail = async (invoice) => {
    setDetailLoading(true);
    setDetailInvoice(null);
    try {
      const { data } = await billingAPI.getInvoice(invoice.id);
      setDetailInvoice(data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setDetailLoading(false);
    }
  };

  const animalGroups = useMemo(
    () => groupItemsByAnimal(detailInvoice?.items, t),
    [detailInvoice?.items, t]
  );

  const addItem = () => {
    if (!newItem.description || !newItem.unit_price) return toast.error('أدخل وصف البند والسعر');
    const test = tests.find((t) => t.id === newItem.test_id);
    setInvoiceForm({
      ...invoiceForm,
      items: [...invoiceForm.items, {
        test_id: newItem.test_id || null,
        description: newItem.description || test?.name,
        quantity: Number(newItem.quantity) || 1,
        unit_price: Number(newItem.unit_price),
      }],
    });
    setNewItem({ test_id: '', description: '', quantity: 1, unit_price: 0 });
  };

  const createInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.customer_id || !invoiceForm.items.length) return toast.error('اختر العميل وأضف بنود الفاتورة');
    try {
      await billingAPI.createInvoice(invoiceForm);
      toast.success('تم إنشاء الفاتورة');
      setInvoiceModal(false);
      setInvoiceForm({ customer_id: '', sample_id: '', discount_amount: 0, notes: '', items: [] });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      await billingAPI.recordPayment({
        invoice_id: selectedInvoice.id,
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        reference_number: paymentForm.reference_number,
        notes: paymentForm.notes,
      });
      toast.success('تم تسجيل الدفع');
      setPaymentModal(false);
      setPaymentForm({ amount: '', method: 'cash', reference_number: '', notes: '' });
      load();
      if (detailInvoice?.id === selectedInvoice.id) openInvoiceDetail(selectedInvoice);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const openPayment = async (invoice) => {
    let inv = invoice;
    if (inv.balance_due === undefined) {
      try {
        const { data } = await billingAPI.getInvoice(invoice.id);
        inv = data.data;
      } catch {
        inv = invoice;
      }
    }
    setSelectedInvoice(inv);
    const due = inv.balance_due ?? inv.total;
    setPaymentForm({ amount: String(parseFloat(due).toFixed(2)), method: 'cash', reference_number: '', notes: '' });
    setPaymentModal(true);
  };

  const openInvoicePdf = async (invoiceId, regenerate = false) => {
    setPdfLoading(true);
    try {
      await billingAPI.openInvoicePdf(invoiceId, { regenerate });
    } catch {
      toast.error(t('billing.pdfFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  const columns = [
    { key: 'invoice_number', label: t('billing.invoice') },
    { key: 'customer_name', label: t('customers.fullName') },
    { key: 'subtotal', label: t('billing.subtotal'), render: (r) => `SAR ${parseFloat(r.subtotal).toFixed(2)}` },
    { key: 'tax_amount', label: t('billing.tax'), render: (r) => `SAR ${parseFloat(r.tax_amount).toFixed(2)}` },
    { key: 'total', label: t('billing.total'), render: (r) => `SAR ${parseFloat(r.total).toFixed(2)}` },
    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_at', label: t('common.date'), render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => openInvoicePdf(r.id)}
          className="text-primary-600 text-sm flex items-center gap-1"
          title={t('billing.downloadPdf')}
        >
          <Download size={14} />
        </button>
        {canPay && r.status !== 'paid' && r.status !== 'cancelled' ? (
          <button type="button" onClick={() => openPayment(r)} className="text-primary-600 text-sm flex items-center gap-1">
            <CreditCard size={14} /> {t('billing.payment')}
          </button>
        ) : null}
      </div>
    )},
  ];

  const subtotal = invoiceForm.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const afterDiscount = subtotal - (Number(invoiceForm.discount_amount) || 0);
  const tax = afterDiscount * 0.15;
  const total = afterDiscount + tax;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{t('billing.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/accounting" className="btn-secondary flex items-center gap-2">
            <BarChart3 size={18} /> {t('nav.accounting')}
          </Link>
          <Link to="/invoice-settings" className="btn-secondary flex items-center gap-2">
            <Receipt size={18} /> {t('nav.invoiceSettings')}
          </Link>
          <button onClick={() => setInvoiceModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('billing.invoice')}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('invoices')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'invoices' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
          {t('billing.invoice')}
        </button>
        <button onClick={() => setTab('packages')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'packages' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
          {t('billing.packages')}
        </button>
      </div>

      {tab === 'invoices' ? (
        <DataTable columns={columns} data={invoices} loading={loading} onRowClick={openInvoiceDetail} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <div key={pkg.id} className="card">
              <h3 className="font-semibold">{pkg.name}</h3>
              <p className="text-2xl font-bold text-primary-600 mt-2">SAR {pkg.price}</p>
              {pkg.test_names?.filter(Boolean).length > 0 && (
                <p className="text-sm text-gray-500 mt-2">{pkg.test_names.join(', ')}</p>
              )}
            </div>
          ))}
          {!packages.length && <p className="text-gray-500">{t('common.noData')}</p>}
        </div>
      )}

      <Modal
        isOpen={!!detailInvoice || detailLoading}
        onClose={() => { setDetailInvoice(null); setDetailLoading(false); }}
        title={detailInvoice ? `${t('billing.invoiceDetails')} — ${detailInvoice.invoice_number}` : t('billing.invoiceDetails')}
        size="xl"
      >
        {detailLoading ? (
          <p className="text-center py-8 text-gray-500">{t('common.loading')}</p>
        ) : detailInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500">{t('customers.fullName')}:</span> {detailInvoice.customer_name}</div>
              <div><span className="text-gray-500">{t('common.status')}:</span> <StatusBadge status={detailInvoice.status} /></div>
              <div><span className="text-gray-500">{t('common.date')}:</span> {new Date(detailInvoice.created_at).toLocaleString()}</div>
              <div><span className="text-gray-500">{t('billing.total')}:</span> <strong>SAR {parseFloat(detailInvoice.total).toFixed(2)}</strong></div>
              <div><span className="text-gray-500">{t('billing.paid')}:</span> SAR {parseFloat(detailInvoice.total_paid || 0).toFixed(2)}</div>
              <div><span className="text-gray-500">{t('billing.balanceDue')}:</span> <strong className="text-amber-700">SAR {parseFloat(detailInvoice.balance_due || 0).toFixed(2)}</strong></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openInvoicePdf(detailInvoice.id)}
                disabled={pdfLoading}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Download size={16} /> {pdfLoading ? t('common.loading') : t('billing.downloadPdf')}
              </button>
              <button
                type="button"
                onClick={() => openInvoicePdf(detailInvoice.id, true)}
                disabled={pdfLoading}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Printer size={16} /> {t('billing.regeneratePdf')}
              </button>
            </div>

            <div>
              <h4 className="font-semibold mb-2">{t('billing.itemsByAnimal')}</h4>
              <div className="space-y-3">
                {animalGroups.map((group) => (
                  <div key={group.animal_id || 'general'} className="border rounded-lg overflow-hidden">
                    <div className="bg-primary-50 dark:bg-primary-900/30 px-3 py-2 font-medium text-sm">
                      {group.label}
                    </div>
                    <div className="divide-y">
                      {group.items.map((item) => (
                        <div key={item.id} className="flex justify-between px-3 py-2 text-sm">
                          <span>{item.description || item.test_name} × {item.quantity}</span>
                          <span>SAR {parseFloat(item.total_price).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span>{t('billing.subtotal')}:</span><span>SAR {parseFloat(detailInvoice.subtotal).toFixed(2)}</span></div>
              {parseFloat(detailInvoice.discount_amount) > 0 && (
                <div className="flex justify-between"><span>{t('billing.discount')}:</span><span>- SAR {parseFloat(detailInvoice.discount_amount).toFixed(2)}</span></div>
              )}
              <div className="flex justify-between"><span>{t('billing.tax')}:</span><span>SAR {parseFloat(detailInvoice.tax_amount).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold"><span>{t('billing.total')}:</span><span>SAR {parseFloat(detailInvoice.total).toFixed(2)}</span></div>
              {parseFloat(detailInvoice.total_paid || 0) > 0 && (
                <div className="flex justify-between text-green-700"><span>{t('billing.paid')}:</span><span>SAR {parseFloat(detailInvoice.total_paid).toFixed(2)}</span></div>
              )}
              {parseFloat(detailInvoice.balance_due || 0) > 0.009 && (
                <div className="flex justify-between font-bold text-amber-700"><span>{t('billing.balanceDue')}:</span><span>SAR {parseFloat(detailInvoice.balance_due).toFixed(2)}</span></div>
              )}
            </div>

            {(detailInvoice.payments || []).length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">{t('billing.paymentHistory')}</h4>
                <div className="border rounded-lg overflow-hidden text-sm">
                  <div className="grid grid-cols-4 gap-2 bg-primary-50 dark:bg-primary-900/30 px-3 py-2 font-medium text-xs">
                    <span>{t('common.date')}</span>
                    <span>{t('billing.paymentMethod')}</span>
                    <span>{t('billing.amount')}</span>
                    <span>{t('billing.reference')}</span>
                  </div>
                  {detailInvoice.payments.map((p) => (
                    <div key={p.id} className="grid grid-cols-4 gap-2 px-3 py-2 border-t">
                      <span>{new Date(p.created_at).toLocaleString()}</span>
                      <span>{paymentMethodLabel(p.method)}</span>
                      <span className="font-medium">SAR {parseFloat(p.amount).toFixed(2)}</span>
                      <span className="text-gray-500 truncate">{p.reference_number || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canPay && detailInvoice.status !== 'paid' && detailInvoice.status !== 'cancelled' && (
              <div className="flex justify-end">
                <button onClick={() => openPayment(detailInvoice)} className="btn-primary flex items-center gap-2">
                  <CreditCard size={16} /> {t('billing.payment')}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={invoiceModal} onClose={() => setInvoiceModal(false)} title={t('billing.invoice')} size="xl">
        <form onSubmit={createInvoice} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.fullName')}</label>
              <CustomerSearch
                value={invoiceForm.customer_id}
                onChange={(id) => setInvoiceForm({ ...invoiceForm, customer_id: id })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">خصم (SAR)</label>
              <input type="number" min="0" value={invoiceForm.discount_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, discount_amount: e.target.value })} className="input-field" />
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-medium">إضافة بند</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select value={newItem.test_id} onChange={(e) => {
                const test = tests.find((t) => t.id === e.target.value);
                setNewItem({ ...newItem, test_id: e.target.value, description: test?.name || '', unit_price: test?.price || 0 });
              }} className="input-field">
                <option value="">فحص (اختياري)</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.name} - SAR {t.price}</option>)}
              </select>
              <input placeholder="الوصف" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} className="input-field" />
              <input type="number" min="1" placeholder="الكمية" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="input-field" />
              <input type="number" min="0" placeholder="السعر" value={newItem.unit_price} onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })} className="input-field" />
            </div>
            <button type="button" onClick={addItem} className="btn-secondary text-sm">+ إضافة بند</button>
            {invoiceForm.items.length > 0 && (
              <div className="text-sm space-y-1 mt-2">
                {invoiceForm.items.map((item, i) => (
                  <div key={i} className="flex justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                    <span>{item.description} x{item.quantity}</span>
                    <span>SAR {(item.unit_price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg text-sm space-y-1">
            <div className="flex justify-between"><span>{t('billing.subtotal')}:</span><span>SAR {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>{t('billing.tax')}:</span><span>SAR {tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-base"><span>{t('billing.total')}:</span><span>SAR {total.toFixed(2)}</span></div>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setInvoiceModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={paymentModal} onClose={() => setPaymentModal(false)} title={`${t('billing.payment')} — ${selectedInvoice?.invoice_number}`}>
        <form onSubmit={recordPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">المبلغ (SAR)</label>
            <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.paymentMethod')}</label>
            <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} className="input-field">
              <option value="cash">{t('billing.paymentMethods.cash')}</option>
              <option value="card">{t('billing.paymentMethods.card')}</option>
              <option value="bank_transfer">{t('billing.paymentMethods.bank_transfer')}</option>
              <option value="credit">{t('billing.paymentMethods.credit')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.reference')}</label>
            <input value={paymentForm.reference_number} onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPaymentModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('billing.payment')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
