import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, Calendar, Users, BookOpen, CreditCard, Download, Printer,
  Lock, Unlock, FileSpreadsheet, Search, XCircle, RotateCcw, Eye, Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/ui/StatusBadge';
import Modal from '../components/ui/Modal';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

function SummaryCard({ label, value, accent }) {
  return (
    <div className="card p-4 min-w-[140px] flex-1">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent || 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}

export default function AccountingReports() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canPay = hasPermission('billing.payment');
  const canRefund = hasPermission('billing.refund');
  const canCancel = hasPermission('billing.cancel');
  const canCloseDay = hasPermission('billing.day_close');
  const canReopenDay = hasPermission('billing.day_reopen');

  const [mainTab, setMainTab] = useState('invoices');
  const [reportTab, setReportTab] = useState('collections');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);

  const [invoices, setInvoices] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: '', status: '', payment_method: '', date_from: '', date_to: '',
  });

  const [closingDate, setClosingDate] = useState(today());
  const [closingData, setClosingData] = useState(null);
  const [closingLoading, setClosingLoading] = useState(false);

  const [collections, setCollections] = useState(null);
  const [arAging, setArAging] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [journal, setJournal] = useState([]);
  const [unpaidReport, setUnpaidReport] = useState([]);
  const [vatReport, setVatReport] = useState(null);
  const [cancelledReport, setCancelledReport] = useState(null);
  const [serviceReport, setServiceReport] = useState(null);
  const [customerReport, setCustomerReport] = useState(null);
  const [reportRange, setReportRange] = useState({ from: '', to: '' });

  const [detailInvoice, setDetailInvoice] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', reference_number: '', notes: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });
  const [pdfLoading, setPdfLoading] = useState(false);

  const paymentMethodLabel = (method) => t(`billing.paymentMethods.${method}`, { defaultValue: method });
  const statusLabel = (status) => t(`billing.invoiceStatus.${status}`, { defaultValue: status });

  const loadDashboard = useCallback(async () => {
    try {
      const { data } = await billingAPI.dashboardSummary({ date: today() });
      setDashboard(data.data);
    } catch {
      /* optional */
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v != null)
      );
      const { data } = await billingAPI.invoices({ ...params, limit: 100 });
      setInvoices(data.data);
    } catch {
      toast.error(t('accounting.loadFailed'));
    } finally {
      setInvoiceLoading(false);
    }
  }, [filters, t]);

  const loadClosing = useCallback(async () => {
    setClosingLoading(true);
    try {
      const { data } = await billingAPI.dailyClosing({ date: closingDate });
      setClosingData(data.data);
    } catch {
      toast.error(t('accounting.loadFailed'));
    } finally {
      setClosingLoading(false);
    }
  }, [closingDate, t]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      if (reportTab === 'collections') {
        const { data } = await billingAPI.collectionsReport({ date: closingDate });
        setCollections(data.data);
      } else if (reportTab === 'ar') {
        const { data } = await billingAPI.arAgingReport();
        setArAging(data.data);
      } else if (reportTab === 'revenue') {
        const { data } = await billingAPI.revenueReport();
        setRevenue(data.data);
      } else if (reportTab === 'journal') {
        const { data } = await billingAPI.journalReport();
        setJournal(data.data);
      } else if (reportTab === 'unpaid') {
        const { data } = await billingAPI.unpaidReport();
        setUnpaidReport(data.data);
      } else if (reportTab === 'vat') {
        const { data } = await billingAPI.vatReport(reportRange);
        setVatReport(data.data);
      } else if (reportTab === 'cancelled') {
        const { data } = await billingAPI.cancelledRefundedReport(reportRange);
        setCancelledReport(data.data);
      } else if (reportTab === 'byService') {
        const { data } = await billingAPI.revenueByServiceReport(reportRange);
        setServiceReport(data.data);
      } else if (reportTab === 'byCustomer') {
        const { data } = await billingAPI.revenueByCustomerReport(reportRange);
        setCustomerReport(data.data);
      }
    } catch {
      toast.error(t('accounting.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [reportTab, closingDate, reportRange, t]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (mainTab === 'invoices') loadInvoices(); }, [mainTab, loadInvoices]);
  useEffect(() => { if (mainTab === 'closing') loadClosing(); }, [mainTab, loadClosing, closingDate]);
  useEffect(() => { if (mainTab === 'reports') loadReports(); }, [mainTab, loadReports, reportTab, closingDate, reportRange]);

  const openDetail = async (invoice) => {
    setDetailLoading(true);
    setDetailInvoice(null);
    try {
      const { data } = await billingAPI.getInvoice(invoice.id);
      setDetailInvoice(data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('accounting.loadFailed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openPayment = (invoice) => {
    setSelectedInvoice(invoice);
    const due = invoice.balance_due ?? invoice.total;
    setPaymentForm({ amount: String(parseFloat(due).toFixed(2)), method: 'cash', reference_number: '', notes: '' });
    setPaymentModal(true);
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
      toast.success(t('accounting.paymentRecorded'));
      setPaymentModal(false);
      loadInvoices();
      loadDashboard();
      if (detailInvoice?.id === selectedInvoice.id) openDetail(selectedInvoice);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('accounting.loadFailed'));
    }
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    try {
      await billingAPI.refund({
        invoice_id: selectedInvoice.id,
        amount: Number(refundForm.amount),
        reason: refundForm.reason,
      });
      toast.success(t('accounting.refundDone'));
      setRefundModal(false);
      loadInvoices();
      loadDashboard();
      if (detailInvoice?.id === selectedInvoice.id) openDetail(selectedInvoice);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('accounting.loadFailed'));
    }
  };

  const handleCancel = async (invoice) => {
    const reason = window.prompt(t('accounting.cancelReason'));
    if (reason === null) return;
    try {
      await billingAPI.cancelInvoice(invoice.id, reason);
      toast.success(t('accounting.cancelDone'));
      loadInvoices();
      loadDashboard();
      if (detailInvoice?.id === invoice.id) setDetailInvoice(null);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('accounting.loadFailed'));
    }
  };

  const openInvoicePdf = async (id, regenerate = false) => {
    setPdfLoading(true);
    try {
      await billingAPI.openInvoicePdf(id, { regenerate });
    } catch {
      toast.error(t('billing.pdfFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  const printInvoice = async (id) => {
    setPdfLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${API_URL}/billing/invoices/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) w.addEventListener('load', () => w.print());
    } catch {
      toast.error(t('billing.pdfFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCloseDay = async () => {
    if (!window.confirm(t('accounting.confirmClose'))) return;
    try {
      await billingAPI.closeDay(closingDate);
      toast.success(t('accounting.dayClosed'));
      loadClosing();
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('accounting.loadFailed'));
    }
  };

  const handleReopenDay = async () => {
    if (!window.confirm(t('accounting.confirmReopen'))) return;
    try {
      await billingAPI.reopenDay(closingDate);
      toast.success(t('accounting.dayReopened'));
      loadClosing();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('accounting.loadFailed'));
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      await billingAPI.exportInvoicesCsv(params);
    } catch {
      toast.error(t('accounting.exportFailed'));
    }
  };

  const dashboardCards = useMemo(() => {
    const d = dashboard || {};
    const by = d.by_method || {};
    return [
      { label: t('accounting.todayCollection'), value: fmt(d.today_collections), accent: 'text-green-700' },
      { label: t('billing.paymentMethods.cash'), value: fmt(by.cash) },
      { label: t('billing.paymentMethods.card'), value: fmt(by.card) },
      { label: t('billing.paymentMethods.bank_transfer'), value: fmt(by.bank_transfer) },
      { label: t('billing.paymentMethods.credit'), value: fmt(by.credit) },
      { label: t('accounting.totalVat'), value: fmt(d.tax_total), accent: 'text-primary-700' },
      { label: t('accounting.invoiceCount'), value: d.invoice_count ?? 0 },
      { label: t('accounting.unpaidCount'), value: d.unpaid_invoices ?? 0, accent: 'text-amber-700' },
      { label: t('accounting.cancelledCount'), value: d.cancelled_today ?? 0, accent: 'text-red-700' },
    ];
  }, [dashboard, t]);

  const mainTabs = [
    { id: 'invoices', icon: Receipt, label: t('accounting.invoicesTab') },
    { id: 'closing', icon: Lock, label: t('accounting.closingTab') },
    { id: 'reports', icon: BarChart3, label: t('accounting.reportsTab') },
  ];

  const reportTabs = [
    { id: 'collections', icon: Calendar, label: t('accounting.collections') },
    { id: 'ar', icon: Users, label: t('accounting.arAging') },
    { id: 'revenue', icon: BarChart3, label: t('accounting.revenue') },
    { id: 'journal', icon: BookOpen, label: t('accounting.journal') },
    { id: 'unpaid', icon: CreditCard, label: t('accounting.unpaidReport') },
    { id: 'vat', icon: Receipt, label: t('accounting.vatReport') },
    { id: 'cancelled', icon: XCircle, label: t('accounting.cancelledReport') },
    { id: 'byService', icon: BarChart3, label: t('accounting.byService') },
    { id: 'byCustomer', icon: Users, label: t('accounting.byCustomer') },
  ];

  const needsRange = ['vat', 'cancelled', 'byService', 'byCustomer'].includes(reportTab);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('accounting.titleFull')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('accounting.subtitle')}</p>
        </div>
        <Link to="/billing" className="btn-secondary flex items-center gap-2 text-sm">
          <Receipt size={16} /> {t('nav.billing')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {dashboardCards.map((c) => (
          <SummaryCard key={c.label} {...c} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {mainTabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMainTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mainTab === id ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {mainTab === 'invoices' && (
        <div className="space-y-4">
          <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                className="input-field ps-9"
                placeholder={t('accounting.searchPlaceholder')}
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && loadInvoices()}
              />
            </div>
            <input type="date" className="input-field" value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            <input type="date" className="input-field" value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
            <select className="input-field" value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">{t('accounting.allStatuses')}</option>
              {['issued', 'partial', 'paid', 'cancelled', 'refunded', 'partial_refunded'].map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
            <select className="input-field" value={filters.payment_method}
              onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}>
              <option value="">{t('accounting.allMethods')}</option>
              {['cash', 'card', 'bank_transfer', 'credit'].map((m) => (
                <option key={m} value={m}>{paymentMethodLabel(m)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadInvoices} className="btn-primary text-sm">{t('common.search')}</button>
            <button type="button" onClick={() => setFilters({ search: '', status: '', payment_method: '', date_from: '', date_to: '' })}
              className="btn-secondary text-sm">{t('common.reset')}</button>
            <button type="button" onClick={handleExportCsv} className="btn-secondary text-sm flex items-center gap-1">
              <FileSpreadsheet size={14} /> Excel
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-primary-50 dark:bg-primary-900/20 text-start">
                  <th className="p-3 font-semibold">{t('billing.invoice')}</th>
                  <th className="p-3 font-semibold">{t('customers.fullName')}</th>
                  <th className="p-3 font-semibold">{t('common.date')}</th>
                  <th className="p-3 font-semibold">{t('billing.subtotal')}</th>
                  <th className="p-3 font-semibold">{t('billing.tax')}</th>
                  <th className="p-3 font-semibold">{t('billing.total')}</th>
                  <th className="p-3 font-semibold">{t('billing.paymentMethod')}</th>
                  <th className="p-3 font-semibold">{t('common.status')}</th>
                  <th className="p-3 font-semibold">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {invoiceLoading ? (
                  <tr><td colSpan={9} className="p-8 text-center text-gray-500">{t('common.loading')}</td></tr>
                ) : invoices.map((inv) => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-3 font-medium">{inv.invoice_number}</td>
                    <td className="p-3">{inv.customer_name}</td>
                    <td className="p-3">{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td className="p-3">{fmt(inv.subtotal)}</td>
                    <td className="p-3">{fmt(inv.tax_amount)}</td>
                    <td className="p-3 font-semibold">{fmt(inv.total)}</td>
                    <td className="p-3 text-xs">
                      {(inv.payment_methods || '').split(',').filter(Boolean).map((m) => paymentMethodLabel(m)).join('، ') || '—'}
                    </td>
                    <td className="p-3"><StatusBadge status={inv.status} label={statusLabel(inv.status)} /></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" title={t('common.view')} onClick={() => openDetail(inv)} className="p-1.5 rounded hover:bg-gray-100 text-primary-600"><Eye size={15} /></button>
                        <button type="button" title={t('billing.downloadPdf')} onClick={() => openInvoicePdf(inv.id)} className="p-1.5 rounded hover:bg-gray-100 text-primary-600"><Download size={15} /></button>
                        <button type="button" title={t('accounting.print')} onClick={() => printInvoice(inv.id)} className="p-1.5 rounded hover:bg-gray-100 text-primary-600"><Printer size={15} /></button>
                        {canPay && !['paid', 'cancelled', 'refunded'].includes(inv.status) && (
                          <button type="button" title={t('billing.payment')} onClick={() => openPayment(inv)} className="p-1.5 rounded hover:bg-gray-100 text-green-600"><CreditCard size={15} /></button>
                        )}
                        {canCancel && !['cancelled', 'refunded'].includes(inv.status) && (
                          <button type="button" title={t('accounting.cancelInvoice')} onClick={() => handleCancel(inv)} className="p-1.5 rounded hover:bg-gray-100 text-red-600"><XCircle size={15} /></button>
                        )}
                        {canRefund && parseFloat(inv.total_paid || 0) > 0 && inv.status !== 'cancelled' && (
                          <button type="button" title={t('billing.refund')} onClick={() => { setSelectedInvoice(inv); setRefundForm({ amount: '', reason: '' }); setRefundModal(true); }} className="p-1.5 rounded hover:bg-gray-100 text-amber-600"><RotateCcw size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!invoiceLoading && !invoices.length && (
              <p className="p-8 text-center text-gray-500">{t('accounting.noData')}</p>
            )}
          </div>
        </div>
      )}

      {mainTab === 'closing' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium">{t('accounting.date')}</label>
            <input type="date" className="input-field w-auto" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
            {canCloseDay && !closingData?.is_closed && (
              <button type="button" onClick={handleCloseDay} className="btn-primary flex items-center gap-2 text-sm">
                <Lock size={16} /> {t('accounting.closeDay')}
              </button>
            )}
            {canReopenDay && closingData?.is_closed && (
              <button type="button" onClick={handleReopenDay} className="btn-secondary flex items-center gap-2 text-sm text-amber-700">
                <Unlock size={16} /> {t('accounting.reopenDay')}
              </button>
            )}
            {closingData?.closing?.pdf_url && (
              <button type="button" onClick={() => billingAPI.openClosingPdf(closingData.closing.id)} className="btn-secondary flex items-center gap-2 text-sm">
                <Download size={16} /> PDF
              </button>
            )}
          </div>

          {closingLoading ? (
            <p className="text-center py-10 text-gray-500">{t('common.loading')}</p>
          ) : closingData?.summary && (
            <>
              {closingData.is_closed && closingData.closing && (
                <div className="card p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 text-sm">
                  <p className="font-semibold text-green-800">{t('accounting.dayIsClosed')}</p>
                  <p>{t('accounting.closingNumber')}: {closingData.closing.closing_number}</p>
                  <p>{t('accounting.closedBy')}: {closingData.closing.closed_by_name} — {new Date(closingData.closing.closed_at).toLocaleString()}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  [t('accounting.invoicedTotal'), closingData.summary.invoiced_total],
                  [t('billing.paymentMethods.cash'), closingData.summary.by_method?.cash],
                  [t('billing.paymentMethods.card'), closingData.summary.by_method?.card],
                  [t('billing.paymentMethods.bank_transfer'), closingData.summary.by_method?.bank_transfer],
                  [t('billing.paymentMethods.credit'), closingData.summary.by_method?.credit],
                  [t('accounting.totalVat'), closingData.summary.tax_total],
                  [t('billing.discount'), closingData.summary.discount_total],
                  [t('accounting.netCollection'), closingData.summary.net_collections],
                  [t('accounting.invoiceCount'), closingData.summary.invoice_count],
                  [t('accounting.unpaidCount'), closingData.summary.unpaid_count],
                  [t('accounting.cancelledCount'), closingData.summary.cancelled_count],
                ].map(([label, val]) => (
                  <div key={label} className="card p-4">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-lg font-bold">{typeof val === 'number' && label !== t('accounting.invoiceCount') && label !== t('accounting.unpaidCount') && label !== t('accounting.cancelledCount') ? fmt(val) : (val ?? 0)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {mainTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {reportTabs.map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" onClick={() => setReportTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  reportTab === id ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50'
                }`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {(reportTab === 'collections' || needsRange) && (
            <div className="flex flex-wrap items-center gap-2">
              {reportTab === 'collections' ? (
                <>
                  <label className="text-sm">{t('accounting.date')}</label>
                  <input type="date" className="input-field w-auto" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
                </>
              ) : (
                <>
                  <input type="date" className="input-field w-auto" value={reportRange.from}
                    onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })} />
                  <span>—</span>
                  <input type="date" className="input-field w-auto" value={reportRange.to}
                    onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })} />
                </>
              )}
            </div>
          )}

          {loading && <p className="text-center py-10 text-gray-500">{t('common.loading')}</p>}

          {!loading && reportTab === 'collections' && collections && (
            <div className="space-y-4">
              <div className="card p-4 flex flex-wrap gap-6">
                <div>
                  <p className="text-sm text-gray-500">{t('accounting.totalCollected')}</p>
                  <p className="text-2xl font-bold text-green-700">{fmt(collections.total)}</p>
                </div>
                {Object.entries(collections.by_method || {}).map(([method, amount]) => (
                  <div key={method}>
                    <p className="text-sm text-gray-500">{paymentMethodLabel(method)}</p>
                    <p className="text-lg font-semibold">{fmt(amount)}</p>
                  </div>
                ))}
              </div>
              <ReportTable
                headers={[t('billing.invoice'), t('customers.fullName'), t('billing.paymentMethod'), t('billing.amount')]}
                rows={collections.payments.map((p) => [p.invoice_number, p.customer_name, paymentMethodLabel(p.method), fmt(p.amount)])}
                empty={t('accounting.noData')}
              />
            </div>
          )}

          {!loading && reportTab === 'ar' && arAging && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  [t('accounting.totalAr'), arAging.totals.balance_due],
                  [t('accounting.bucket0_30'), arAging.totals.bucket_0_30],
                  [t('accounting.bucket31_60'), arAging.totals.bucket_31_60],
                  [t('accounting.bucket61plus'), arAging.totals.bucket_61_plus],
                ].map(([key, val]) => (
                  <div key={key} className="card p-4">
                    <p className="text-xs text-gray-500">{key}</p>
                    <p className="text-lg font-bold">{fmt(val)}</p>
                  </div>
                ))}
              </div>
              <ReportTable
                headers={[t('customers.fullName'), t('accounting.openInvoices'), t('billing.balanceDue'), '0-30', '31-60', '61+']}
                rows={(arAging.customers || []).map((c) => [
                  c.customer_name, c.open_invoices, fmt(c.balance_due), fmt(c.bucket_0_30), fmt(c.bucket_31_60), fmt(c.bucket_61_plus),
                ])}
                empty={t('accounting.noData')}
              />
            </div>
          )}

          {!loading && reportTab === 'revenue' && revenue && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card p-4"><p className="text-sm text-gray-500">{t('accounting.invoiced')}</p><p className="text-xl font-bold">{fmt(revenue.invoiced_total)}</p></div>
              <div className="card p-4"><p className="text-sm text-gray-500">{t('accounting.collected')}</p><p className="text-xl font-bold text-green-700">{fmt(revenue.collections_total)}</p></div>
              <div className="card p-4"><p className="text-sm text-gray-500">{t('accounting.totalVat')}</p><p className="text-xl font-bold">{fmt(revenue.tax_total)}</p></div>
            </div>
          )}

          {!loading && reportTab === 'journal' && (
            <ReportTable
              headers={[t('accounting.date'), t('accounting.description'), t('accounting.source'), t('accounting.debit')]}
              rows={journal.map((j) => [j.entry_date, j.description, j.source_type, fmt(j.debit)])}
              empty={t('accounting.noData')}
            />
          )}

          {!loading && reportTab === 'unpaid' && (
            <ReportTable
              headers={[t('billing.invoice'), t('customers.fullName'), t('billing.total'), t('billing.paid'), t('billing.balanceDue'), t('common.date')]}
              rows={unpaidReport.map((r) => [r.invoice_number, r.customer_name, fmt(r.total), fmt(r.total_paid), fmt(r.balance_due), new Date(r.created_at).toLocaleDateString()])}
              empty={t('accounting.noData')}
            />
          )}

          {!loading && reportTab === 'vat' && vatReport && (
            <div className="space-y-4">
              <div className="card p-4 flex gap-6">
                <div><p className="text-sm text-gray-500">{t('accounting.totalVat')}</p><p className="text-xl font-bold">{fmt(vatReport.totals.tax)}</p></div>
                <div><p className="text-sm text-gray-500">{t('accounting.invoiced')}</p><p className="text-xl font-bold">{fmt(vatReport.totals.gross)}</p></div>
              </div>
              <ReportTable
                headers={[t('accounting.date'), t('accounting.totalVat'), t('billing.total'), t('accounting.invoiceCount')]}
                rows={(vatReport.days || []).map((d) => [d.day, fmt(d.tax), fmt(d.gross), d.invoices])}
                empty={t('accounting.noData')}
              />
            </div>
          )}

          {!loading && reportTab === 'cancelled' && cancelledReport && (
            <ReportTable
              headers={[t('billing.invoice'), t('customers.fullName'), t('common.status'), t('billing.total'), t('billing.refund')]}
              rows={(cancelledReport.invoices || []).map((r) => [r.invoice_number, r.customer_name, statusLabel(r.status), fmt(r.total), fmt(r.refunded_amount)])}
              empty={t('accounting.noData')}
            />
          )}

          {!loading && reportTab === 'byService' && serviceReport && (
            <ReportTable
              headers={[t('accounting.service'), t('accounting.revenue'), t('accounting.lineCount')]}
              rows={(serviceReport.services || []).map((s) => [s.service_name, fmt(s.revenue), s.line_count])}
              empty={t('accounting.noData')}
            />
          )}

          {!loading && reportTab === 'byCustomer' && customerReport && (
            <ReportTable
              headers={[t('customers.fullName'), t('accounting.invoiceCount'), t('accounting.invoiced'), t('accounting.collected')]}
              rows={(customerReport.customers || []).map((c) => [c.full_name, c.invoice_count, fmt(c.invoiced), fmt(c.collected)])}
              empty={t('accounting.noData')}
            />
          )}
        </div>
      )}

      <Modal isOpen={!!detailInvoice || detailLoading} onClose={() => { setDetailInvoice(null); setDetailLoading(false); }}
        title={detailInvoice ? `${t('billing.invoiceDetails')} — ${detailInvoice.invoice_number}` : t('billing.invoiceDetails')} size="lg">
        {detailLoading ? <p className="text-center py-8">{t('common.loading')}</p> : detailInvoice && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">{t('customers.fullName')}:</span> {detailInvoice.customer_name}</div>
              <div><span className="text-gray-500">{t('common.status')}:</span> <StatusBadge status={detailInvoice.status} label={statusLabel(detailInvoice.status)} /></div>
              <div><span className="text-gray-500">{t('billing.total')}:</span> <strong>{fmt(detailInvoice.total)}</strong></div>
              <div><span className="text-gray-500">{t('billing.balanceDue')}:</span> <strong className="text-amber-700">{fmt(detailInvoice.balance_due)}</strong></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openInvoicePdf(detailInvoice.id)} disabled={pdfLoading} className="btn-secondary text-sm flex items-center gap-1"><Download size={14} /> PDF</button>
              <button type="button" onClick={() => printInvoice(detailInvoice.id)} className="btn-secondary text-sm flex items-center gap-1"><Printer size={14} /> {t('accounting.print')}</button>
            </div>
            {(detailInvoice.payments || []).length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">{t('billing.paymentHistory')}</h4>
                {detailInvoice.payments.map((p) => (
                  <div key={p.id} className="flex justify-between border-b py-1">
                    <span>{new Date(p.created_at).toLocaleString()} — {paymentMethodLabel(p.method)}</span>
                    <span className="font-medium">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={paymentModal} onClose={() => setPaymentModal(false)} title={`${t('billing.payment')} — ${selectedInvoice?.invoice_number}`}>
        <form onSubmit={recordPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.amount')}</label>
            <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.paymentMethod')}</label>
            <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} className="input-field">
              {['cash', 'card', 'bank_transfer', 'credit'].map((m) => (
                <option key={m} value={m}>{paymentMethodLabel(m)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPaymentModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('billing.payment')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={refundModal} onClose={() => setRefundModal(false)} title={`${t('billing.refund')} — ${selectedInvoice?.invoice_number}`}>
        <form onSubmit={handleRefund} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.amount')}</label>
            <input type="number" step="0.01" value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('accounting.refundReason')}</label>
            <input value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} className="input-field" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setRefundModal(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('billing.refund')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ReportTable({ headers, rows, empty }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-start">
            {headers.map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              {row.map((cell, j) => <td key={j} className="p-3">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="p-6 text-center text-gray-500">{empty}</p>}
    </div>
  );
}
