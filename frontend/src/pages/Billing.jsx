import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Plus, CreditCard, Download, Printer, BarChart3, Receipt, MapPin, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';
import CustomerSearch from '../components/customers/CustomerSearch';
import DiscountField from '../components/billing/DiscountField';
import FieldVisitDistanceField from '../components/billing/FieldVisitDistanceField';
import { DISCOUNT_TYPES, calcSplitTotals, buildSplitDiscountPayload, initDiscountFromInvoice, initFieldVisitDiscountFromInvoice, calcInvoiceTotals, splitLineSubtotals } from '../utils/discount';
import { fmtCatalog, fmtNet, fmtGross, VAT_RATE } from '../utils/vat';
import { billingAPI, testsAPI } from '../services/api';
import { printThermalInvoice, labFromInvoiceSettings } from '../utils/thermalInvoicePrint';
import {
  FIELD_VISIT_CODE,
  DEFAULT_FIELD_VISIT,
  buildFieldVisitInvoiceItem,
  isFieldVisitItem,
} from '../utils/fieldVisitService';

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
  const { t, i18n } = useTranslation();
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
    customer_id: '', sample_id: '', notes: '', items: [],
  });
  const [discountType, setDiscountType] = useState(DISCOUNT_TYPES.NONE);
  const [discountValue, setDiscountValue] = useState('');
  const [fieldVisitDiscountType, setFieldVisitDiscountType] = useState(DISCOUNT_TYPES.NONE);
  const [fieldVisitDiscountValue, setFieldVisitDiscountValue] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    amount: '', method: 'cash', reference_number: '', notes: '',
  });
  const [paymentDiscountType, setPaymentDiscountType] = useState(DISCOUNT_TYPES.NONE);
  const [paymentDiscountValue, setPaymentDiscountValue] = useState('');
  const [paymentFieldVisitDiscountType, setPaymentFieldVisitDiscountType] = useState(DISCOUNT_TYPES.NONE);
  const [paymentFieldVisitDiscountValue, setPaymentFieldVisitDiscountValue] = useState('');
  const [newItem, setNewItem] = useState({ test_id: '', description: '', quantity: 1, unit_price: 0 });
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [packageQuantity, setPackageQuantity] = useState(1);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [fieldVisit, setFieldVisit] = useState(DEFAULT_FIELD_VISIT);
  const [fieldVisitKm, setFieldVisitKm] = useState('');

  const paymentMethodLabel = (method) => t(`billing.paymentMethods.${method}`, { defaultValue: method });

  const load = () => {
    setLoading(true);
    billingAPI.invoices().then(({ data }) => setInvoices(data.data)).finally(() => setLoading(false));
    billingAPI.packages().then(({ data }) => setPackages(data.data));
  };

  useEffect(() => {
    load();
    testsAPI.list({ limit: 200 }).then(({ data }) => setTests(data.data));
    billingAPI.extraServices()
      .then(({ data }) => {
        const svc = (data.data || []).find((s) => s.code === FIELD_VISIT_CODE);
        if (svc) setFieldVisit(svc);
      })
      .catch(() => {});
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

  const addPackageItem = () => {
    if (!selectedPackageId) return;
    const pkg = packages.find((p) => p.id === selectedPackageId);
    if (!pkg) return;
    const qty = Math.max(1, parseInt(packageQuantity, 10) || 1);
    const existingIdx = invoiceForm.items.findIndex((i) => i.package_id === pkg.id);
    if (existingIdx >= 0) {
      const items = [...invoiceForm.items];
      items[existingIdx] = {
        ...items[existingIdx],
        quantity: (parseInt(items[existingIdx].quantity, 10) || 1) + qty,
      };
      setInvoiceForm({ ...invoiceForm, items });
    } else {
      setInvoiceForm({
        ...invoiceForm,
        items: [...invoiceForm.items, {
          package_id: pkg.id,
          description: pkg.name,
          quantity: qty,
          unit_price: parseFloat(pkg.price) || 0,
        }],
      });
    }
    setSelectedPackageId('');
    setPackageQuantity(1);
  };

  const addFieldVisitItem = () => {
    const km = parseFloat(fieldVisitKm);
    if (!Number.isFinite(km) || km < 0) {
      toast.error(t('priceList.invalidDistance'));
      return;
    }
    if (invoiceForm.items.some(isFieldVisitItem)) {
      toast.error(t('priceList.fieldVisitAlreadyAdded'));
      return;
    }
    setInvoiceForm({
      ...invoiceForm,
      items: [...invoiceForm.items, buildFieldVisitInvoiceItem(fieldVisit, i18n, km)],
    });
    setFieldVisitKm('');
    toast.success(t('priceList.fieldVisitAdded'));
  };

  const createInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.customer_id || !invoiceForm.items.length) return toast.error('اختر العميل وأضف بنود الفاتورة');
    try {
      const discountFields = buildSplitDiscountPayload(
        invoiceForm.items, discountType, discountValue, fieldVisitDiscountType, fieldVisitDiscountValue,
        { catalogPrices: true },
      );
      await billingAPI.createInvoice({
        customer_id: invoiceForm.customer_id,
        sample_id: invoiceForm.sample_id || null,
        notes: invoiceForm.notes || null,
        items: invoiceForm.items.map(({ test_id, package_id, animal_id, service_code, description, quantity, unit_price }) => ({
          test_id: test_id || null,
          package_id: package_id || null,
          animal_id: animal_id || null,
          service_code: service_code || null,
          description,
          quantity: parseInt(quantity, 10) || 1,
          unit_price: parseFloat(unit_price) || 0,
        })),
        ...discountFields,
      });
      toast.success('تم إنشاء الفاتورة');
      setInvoiceModal(false);
      setInvoiceForm({ customer_id: '', sample_id: '', notes: '', items: [] });
      setSelectedPackageId('');
      setPackageQuantity(1);
      setNewItem({ test_id: '', description: '', quantity: 1, unit_price: 0 });
      setDiscountType(DISCOUNT_TYPES.NONE);
      setDiscountValue('');
      setFieldVisitDiscountType(DISCOUNT_TYPES.NONE);
      setFieldVisitDiscountValue('');
      load();
    } catch (err) {
      const details = err.response?.data?.error?.details;
      const detailMsg = Array.isArray(details) && details.length
        ? details.map((d) => d.message).join(' · ')
        : null;
      toast.error(detailMsg || err.response?.data?.error?.message || 'خطأ');
    }
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    try {
      const discountFields = buildSplitDiscountPayload(
        selectedInvoice.items || [],
        paymentDiscountType,
        paymentDiscountValue,
        paymentFieldVisitDiscountType,
        paymentFieldVisitDiscountValue,
        { catalogPrices: false },
      );
      const paidMethod = paymentForm.method;
      const invoiceId = selectedInvoice.id;
      await billingAPI.recordPayment({
        invoice_id: invoiceId,
        amount: Number(paymentForm.amount),
        method: paidMethod,
        reference_number: paymentForm.reference_number,
        notes: paymentForm.notes,
        ...discountFields,
      });
      toast.success('تم تسجيل الدفع');
      setPaymentModal(false);
      setPaymentForm({ amount: '', method: 'cash', reference_number: '', notes: '' });
      setPaymentDiscountType(DISCOUNT_TYPES.NONE);
      setPaymentDiscountValue('');
      setPaymentFieldVisitDiscountType(DISCOUNT_TYPES.NONE);
      setPaymentFieldVisitDiscountValue('');
      load();
      if (detailInvoice?.id === invoiceId) openInvoiceDetail({ id: invoiceId });
      await printThermalReceipt(invoiceId, { paymentMethod: paidMethod });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const openPayment = async (invoice) => {
    let inv = invoice;
    if (inv.balance_due === undefined || inv.subtotal === undefined) {
      try {
        const { data } = await billingAPI.getInvoice(invoice.id);
        inv = data.data;
      } catch {
        inv = invoice;
      }
    }
    setSelectedInvoice(inv);
    const { type, value } = initDiscountFromInvoice(inv);
    const fv = initFieldVisitDiscountFromInvoice(inv);
    setPaymentDiscountType(type);
    setPaymentDiscountValue(value);
    setPaymentFieldVisitDiscountType(fv.type);
    setPaymentFieldVisitDiscountValue(fv.value);
    const paid = parseFloat(inv.total_paid || 0);
    const preview = calcInvoiceTotals(inv.subtotal, type, value, inv.tax_rate || 15, paid, {
      items: inv.items || [],
      fvDiscountType: fv.type,
      fvDiscountValue: fv.value,
      catalogPrices: false,
    });
    setPaymentForm({
      amount: String(preview.balanceDue.toFixed(2)),
      method: 'cash',
      reference_number: '',
      notes: '',
    });
    setPaymentModal(true);
  };

  const paymentPreview = useMemo(() => {
    if (!selectedInvoice) return null;
    const paid = parseFloat(selectedInvoice.total_paid || 0);
    return calcInvoiceTotals(
      selectedInvoice.subtotal,
      paymentDiscountType,
      paymentDiscountValue,
      selectedInvoice.tax_rate || 15,
      paid,
      {
        items: selectedInvoice.items || [],
        fvDiscountType: paymentFieldVisitDiscountType,
        fvDiscountValue: paymentFieldVisitDiscountValue,
        catalogPrices: false,
      },
    );
  }, [
    selectedInvoice,
    paymentDiscountType,
    paymentDiscountValue,
    paymentFieldVisitDiscountType,
    paymentFieldVisitDiscountValue,
  ]);

  useEffect(() => {
    if (!paymentModal || !paymentPreview) return;
    setPaymentForm((prev) => ({ ...prev, amount: String(paymentPreview.balanceDue.toFixed(2)) }));
  }, [paymentModal, paymentPreview?.balanceDue, paymentDiscountType, paymentDiscountValue, paymentFieldVisitDiscountType, paymentFieldVisitDiscountValue]);

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

  const printThermalReceipt = async (invoiceOrId, { paymentMethod } = {}) => {
    try {
      const id = typeof invoiceOrId === 'string' ? invoiceOrId : invoiceOrId?.id;
      if (!id) return;
      const [{ data: invRes }, settingsRes] = await Promise.all([
        billingAPI.getInvoice(id),
        billingAPI.invoiceSettings().catch(() => null),
      ]);
      const invoice = invRes.data;
      const lab = labFromInvoiceSettings(settingsRes?.data?.data || settingsRes?.data);
      const methodKey = paymentMethod || invoice.payments?.[0]?.method;
      await printThermalInvoice(invoice, lab, {
        isArabic: i18n.language === 'ar',
        paymentMethodLabel: methodKey ? paymentMethodLabel(methodKey) : '',
      });
    } catch (err) {
      if (err?.message === 'POPUP_BLOCKED') {
        toast.error(t('billing.popupBlocked'));
      } else {
        toast.error(t('billing.thermalPrintFailed'));
      }
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
        <button
          type="button"
          onClick={() => printThermalReceipt(r)}
          className="text-primary-600 text-sm flex items-center gap-1"
          title={t('billing.printThermal')}
        >
          <Printer size={14} /> {t('billing.printThermal')}
        </button>
        {canPay && r.status !== 'paid' && r.status !== 'cancelled' ? (
          <button type="button" onClick={() => openPayment(r)} className="text-primary-600 text-sm flex items-center gap-1">
            <CreditCard size={14} /> {t('billing.payment')}
          </button>
        ) : null}
      </div>
    )},
  ];

  const lineSubtotals = useMemo(() => splitLineSubtotals(invoiceForm.items, { catalogPrices: true }), [invoiceForm.items]);
  const invoiceTotals = useMemo(
    () => calcSplitTotals(
      invoiceForm.items, discountType, discountValue, fieldVisitDiscountType, fieldVisitDiscountValue,
      VAT_RATE, { catalogPrices: true },
    ),
    [invoiceForm.items, discountType, discountValue, fieldVisitDiscountType, fieldVisitDiscountValue],
  );

  return (
    <div>
      <div className="mb-6 card p-4 border-primary-200 bg-primary-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-primary-800">{t('accounting.billingHintTitle')}</p>
          <p className="text-sm text-primary-600">{t('accounting.billingHintBody')}</p>
        </div>
        <Link to="/accounting" className="btn-primary flex items-center gap-2 shrink-0">
          <BarChart3 size={18} /> {t('accounting.openModule')}
        </Link>
      </div>

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
              <p className="text-2xl font-bold text-primary-600 mt-2">{fmtCatalog(pkg.price)}</p>
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
              <button
                type="button"
                onClick={() => printThermalReceipt(detailInvoice)}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Receipt size={16} /> {t('billing.printThermal')}
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
                <div className="flex justify-between"><span>{t('billing.servicesDiscount')}:</span><span>- SAR {parseFloat(detailInvoice.discount_amount).toFixed(2)}</span></div>
              )}
              {parseFloat(detailInvoice.field_visit_discount_amount) > 0 && (
                <div className="flex justify-between"><span>{t('billing.fieldVisitDiscount')}:</span><span>- SAR {parseFloat(detailInvoice.field_visit_discount_amount).toFixed(2)}</span></div>
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
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DiscountField
              subtotal={lineSubtotals.serviceSubtotal}
              type={discountType}
              value={discountValue}
              onTypeChange={setDiscountType}
              onValueChange={setDiscountValue}
              labelKey="billing.servicesDiscount"
            />
            <DiscountField
              subtotal={lineSubtotals.fieldVisitSubtotal}
              type={fieldVisitDiscountType}
              value={fieldVisitDiscountValue}
              onTypeChange={setFieldVisitDiscountType}
              onValueChange={setFieldVisitDiscountValue}
              labelKey="billing.fieldVisitDiscount"
            />
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-medium">إضافة بند</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select value={newItem.test_id} onChange={(e) => {
                const test = tests.find((t) => t.id === e.target.value);
                setNewItem({ ...newItem, test_id: e.target.value, description: test?.name || '', unit_price: test?.price || 0 });
              }} className="input-field">
                <option value="">فحص (اختياري)</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.name} - {fmtCatalog(t.price)}</option>)}
              </select>
              <input placeholder="الوصف" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} className="input-field" />
              <input type="number" min="1" placeholder="الكمية" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="input-field" />
              <input type="number" min="0" placeholder="السعر" value={newItem.unit_price} onChange={(e) => setNewItem({ ...newItem, unit_price: e.target.value })} className="input-field" />
            </div>
            <button type="button" onClick={addItem} className="btn-secondary text-sm">+ إضافة بند</button>
            {packages.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                <select
                  className="input-field flex-1"
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                >
                  <option value="">{t('priceList.selectPackage')}</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({fmtCatalog(pkg.price)})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="input-field w-24"
                  value={packageQuantity}
                  onChange={(e) => setPackageQuantity(e.target.value)}
                  placeholder={t('priceList.quantity', { defaultValue: 'الكمية' })}
                  title={t('priceList.quantity', { defaultValue: 'الكمية' })}
                />
                <button
                  type="button"
                  onClick={addPackageItem}
                  disabled={!selectedPackageId}
                  className="btn-secondary text-sm flex items-center gap-1 whitespace-nowrap"
                >
                  <Package size={16} /> {t('priceList.selectPackage')}
                </button>
              </div>
            )}
            <div className="mt-3 p-3 border rounded-lg bg-primary-50/40 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <MapPin size={16} />
                {t('priceList.addFieldVisit')}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <FieldVisitDistanceField
                    fieldVisit={fieldVisit}
                    km={fieldVisitKm}
                    onKmChange={setFieldVisitKm}
                    fmt={fmtCatalog}
                  />
                </div>
                <button
                  type="button"
                  onClick={addFieldVisitItem}
                  disabled={fieldVisitKm === ''}
                  className="btn-secondary text-sm"
                >
                  {t('priceList.addFieldVisit')}
                </button>
              </div>
            </div>
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
            <div className="flex justify-between"><span>{t('billing.subtotal')}:</span><span>{fmtNet(invoiceTotals.subtotal)}</span></div>
            {invoiceTotals.discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{t('billing.servicesDiscount')}:</span>
                <span>- {fmtNet(invoiceTotals.discountAmount)}</span>
              </div>
            )}
            {invoiceTotals.fieldVisitDiscountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{t('billing.fieldVisitDiscount')}:</span>
                <span>- {fmtNet(invoiceTotals.fieldVisitDiscountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between"><span>{t('billing.tax')}:</span><span>{fmtNet(invoiceTotals.taxAmount)}</span></div>
            <div className="flex justify-between font-bold text-base"><span>{t('billing.total')}:</span><span>{fmtGross(invoiceTotals.total)}</span></div>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setInvoiceModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={paymentModal} onClose={() => setPaymentModal(false)} title={`${t('billing.payment')} — ${selectedInvoice?.invoice_number}`}>
        <form onSubmit={recordPayment} className="space-y-4">
          {paymentPreview && (
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span>{t('billing.subtotal')}</span><span>SAR {paymentPreview.subtotal.toFixed(2)}</span></div>
              {paymentPreview.discountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>{t('billing.servicesDiscount')}</span><span>- SAR {paymentPreview.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {paymentPreview.fieldVisitDiscountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>{t('billing.fieldVisitDiscount')}</span><span>- SAR {paymentPreview.fieldVisitDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>{t('billing.tax')}</span><span>SAR {paymentPreview.taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold"><span>{t('billing.total')}</span><span>SAR {paymentPreview.total.toFixed(2)}</span></div>
              <div className="flex justify-between text-primary-700 font-bold border-t pt-1 mt-1">
                <span>{t('billing.balanceDue')}</span><span>SAR {paymentPreview.balanceDue.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DiscountField
              subtotal={splitLineSubtotals(selectedInvoice?.items || []).serviceSubtotal}
              type={paymentDiscountType}
              value={paymentDiscountValue}
              onTypeChange={setPaymentDiscountType}
              onValueChange={setPaymentDiscountValue}
              labelKey="billing.servicesDiscount"
            />
            <DiscountField
              subtotal={splitLineSubtotals(selectedInvoice?.items || []).fieldVisitSubtotal}
              type={paymentFieldVisitDiscountType}
              value={paymentFieldVisitDiscountValue}
              onTypeChange={setPaymentFieldVisitDiscountType}
              onValueChange={setPaymentFieldVisitDiscountValue}
              labelKey="billing.fieldVisitDiscount"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.amount')} (SAR)</label>
            <input type="number" step="0.01" min="0" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-field" required />
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
