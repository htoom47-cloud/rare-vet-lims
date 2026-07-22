import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Route, Receipt, CreditCard, Pencil, Send, MessageCircle, Ban } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import StatusBadge from '../components/ui/StatusBadge';
import { customersAPI, billingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;
const emptyForm = () => ({
  full_name: '', full_name_ar: '', mobile: '', city: '', farm_company: '', notes: '', credit_limit: 0,
});

const DISPATCH_STATUS_META = {
  none: { icon: '⚪', key: 'customers.dispatchStatus.none' },
  ready_one: { icon: '🟡', key: 'customers.dispatchStatus.readyOne' },
  ready_multi: { icon: '🟠', key: 'customers.dispatchStatus.readyMulti' },
  sent: { icon: '🟢', key: 'customers.dispatchStatus.sent' },
  failed: { icon: '🔴', key: 'customers.dispatchStatus.failed' },
};

const channelLabel = (channel, t) => {
  if (channel === 'sms') return 'SMS';
  if (channel === 'whatsapp') return t('customers.channelWhatsapp');
  return channel || '—';
};

const PAGE_SIZE = 20;

export default function Customers() {
  const { t, i18n } = useTranslation();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('customers.update');
  const canSendReports = hasPermission('notifications.send_report');
  const canSkipReadyReports = canSendReports && !!user?.features?.skipReadyReports;
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dispatchFilter, setDispatchFilter] = useState('all'); // all | ready
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [readyReports, setReadyReports] = useState([]);
  const [readyLoading, setReadyLoading] = useState(false);
  const [sendingReports, setSendingReports] = useState(false);
  const [sendChannel, setSendChannel] = useState('whatsapp');
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [skippingReports, setSkippingReports] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [previousSend, setPreviousSend] = useState(null);

  const load = () => {
    setLoading(true);
    const trimmed = search.trim();
    const looksLikeMobile = /^[\d+\s()-]{3,}$/.test(trimmed);
    const params = looksLikeMobile
      ? { mobile: trimmed, page, limit: PAGE_SIZE }
      : { search: trimmed, page, limit: PAGE_SIZE };
    if (dispatchFilter === 'ready') params.readyToSend = true;
    customersAPI.list(params)
      .then(({ data }) => {
        setCustomers(data.data || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 0 });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page, dispatchFilter]);

  const unsentReports = readyReports.filter((r) => !r.previously_sent);

  const loadReadyReports = async (customerId) => {
    if (!customerId || !canSendReports) return;
    setReadyLoading(true);
    try {
      const { data } = await customersAPI.readyReports(customerId);
      setReadyReports(data.data?.reports || []);
    } catch (err) {
      setReadyReports([]);
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setReadyLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (customer) => {
    setEditingId(customer.id);
    setForm({
      full_name: customer.full_name || '',
      full_name_ar: customer.full_name_ar || '',
      mobile: customer.mobile || '',
      city: customer.city || '',
      farm_company: customer.farm_company || '',
      notes: customer.notes || '',
      credit_limit: customer.credit_limit ?? 0,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await customersAPI.update(editingId, form);
        toast.success(t('customers.updated'));
        if (profileOpen && selected?.id === editingId) {
          const { data } = await customersAPI.get(editingId);
          setSelected(data.data);
          await loadReadyReports(editingId);
        }
      } else {
        await customersAPI.create(form);
        toast.success(t('customers.created'));
      }
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const viewProfile = async (customer) => {
    const { data } = await customersAPI.get(customer.id);
    setSelected(data.data);
    setProfileOpen(true);
    setConfirmSendOpen(false);
    setConfirmSkipOpen(false);
    setSkipReason('');
    setResendOpen(false);
    setPreviousSend(null);
    await loadReadyReports(customer.id);
  };

  const renderDispatchStatus = (status) => {
    const meta = DISPATCH_STATUS_META[status] || DISPATCH_STATUS_META.none;
    return (
      <span className="text-sm whitespace-nowrap">
        {meta.icon} {t(meta.key)}
      </span>
    );
  };

  const sendAllReadyReports = async (forceResend = false) => {
    if (!selected?.id) return;
    if (!unsentReports.length && !forceResend) {
      toast.error(t('customers.noReadyReports'));
      return;
    }
    setSendingReports(true);
    try {
      const reportIds = forceResend
        ? readyReports.map((r) => r.id)
        : unsentReports.map((r) => r.id);
      const { data: resp } = await customersAPI.sendReadyReports(selected.id, {
        reportIds,
        channel: sendChannel,
        forceResend,
      });
      if (resp.dryRun) {
        toast(resp.userMessage || t('notifications.dryRunWarning'), { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(t('customers.reportsSentSuccess'));
      }
      setConfirmSendOpen(false);
      setResendOpen(false);
      setPreviousSend(null);
      await loadReadyReports(selected.id);
      load();
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ALREADY_SENT' && !forceResend) {
        setPreviousSend(err.response?.data?.error?.details?.previousSend || null);
        setConfirmSendOpen(false);
        setResendOpen(true);
      } else if (code === 'CHANNEL_DISABLED') {
        toast.error(t('notifications.channelDisabled'));
      } else {
        toast.error(err.response?.data?.error?.message || t('common.error'));
      }
    } finally {
      setSendingReports(false);
    }
  };

  const formatSendStatus = (report) => {
    if (report.send_status === 'skipped') return t('customers.sendStatus.skipped');
    if (report.send_status === 'sent') return t('customers.sendStatus.sent');
    if (report.send_status === 'failed') return t('customers.sendStatus.failed');
    return t('customers.sendStatus.unsent');
  };

  const skipAllReadyReports = async () => {
    if (!selected?.id || !canSkipReadyReports) return;
    if (!unsentReports.length) {
      toast.error(t('customers.noReadyReports'));
      return;
    }
    setSkippingReports(true);
    try {
      await customersAPI.skipReadyReports(selected.id, {
        reportIds: unsentReports.map((r) => r.id),
        reason: skipReason.trim() || undefined,
      });
      toast.success(t('customers.reportsSkippedSuccess'));
      setConfirmSkipOpen(false);
      setSkipReason('');
      await loadReadyReports(selected.id);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setSkippingReports(false);
    }
  };

  const columns = [
    { key: 'full_name', label: t('customers.fullName') },
    { key: 'mobile', label: t('customers.mobile') },
    {
      key: 'report_dispatch_status',
      label: t('customers.reportDispatchStatus'),
      render: (r) => renderDispatchStatus(r.report_dispatch_status),
    },
    { key: 'city', label: t('customers.city') },
    { key: 'farm_company', label: t('customers.farm') },
    { key: 'account_balance', label: t('customers.balance'), render: (r) => `SAR ${parseFloat(r.account_balance).toFixed(2)}` },
    { key: 'animal_count', label: 'Animals' },
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => viewProfile(r)} className="text-primary-600 text-sm hover:underline">{t('common.view')}</button>
        {canEdit && (
          <button type="button" onClick={() => openEdit(r)} className="text-primary-600 text-sm hover:underline flex items-center gap-1">
            <Pencil size={14} /> {t('common.edit')}
          </button>
        )}
      </div>
    )},
  ];

  const customerDisplayName = selected
    ? (i18n.language === 'ar' ? (selected.full_name_ar || selected.full_name) : selected.full_name)
    : '';

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{t('customers.title')}</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="tel"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('customers.searchByMobile')}
              className="input-field ps-10"
            />
          </div>
          <select
            value={dispatchFilter}
            onChange={(e) => { setDispatchFilter(e.target.value); setPage(1); }}
            className="input-field w-full sm:w-auto"
            aria-label={t('customers.dispatchFilterLabel')}
          >
            <option value="all">{t('customers.dispatchFilterAll')}</option>
            <option value="ready">{t('customers.dispatchFilterReady')}</option>
          </select>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('common.add')}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={customers} loading={loading} onRowClick={viewProfile} />

      {pagination.total > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            {i18n.language?.startsWith('ar')
              ? `عرض ${customers.length} من ${pagination.total}`
              : `Showing ${customers.length} of ${pagination.total}`}
            {pagination.totalPages > 1 && (
              <> · {i18n.language?.startsWith('ar') ? `صفحة ${pagination.page} / ${pagination.totalPages}` : `Page ${pagination.page} / ${pagination.totalPages}`}</>
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
                {i18n.language?.startsWith('ar') ? 'السابق' : 'Previous'}
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-3 disabled:opacity-40"
                disabled={page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                {i18n.language?.startsWith('ar') ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); setForm(emptyForm()); }}
        title={editingId ? t('customers.editCustomer') : t('customers.addCustomer')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.fullName')}</label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.fullNameAr')}</label>
              <input value={form.full_name_ar} onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })} className="input-field" dir="rtl" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.mobile')}</label>
              <input type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.city')}</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.farm')}</label>
              <input value={form.farm_company} onChange={(e) => setForm({ ...form, farm_company: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('customers.creditLimit')}</label>
              <input type="number" min="0" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setModalOpen(false); setEditingId(null); }} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={profileOpen} onClose={() => setProfileOpen(false)} title={selected?.full_name} size="lg">
        {selected && (
          <div className="space-y-4">
            {canEdit && (
              <div className="flex justify-end">
                <button type="button" onClick={() => openEdit(selected)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Pencil size={16} /> {t('customers.editCustomer')}
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('customers.fullName')}:</span> {selected.full_name}</div>
              {selected.full_name_ar && (
                <div><span className="text-gray-500">{t('customers.fullNameAr')}:</span> {selected.full_name_ar}</div>
              )}
              <div><span className="text-gray-500">{t('customers.mobile')}:</span> {selected.mobile}</div>
              <div><span className="text-gray-500">{t('customers.city')}:</span> {selected.city || '—'}</div>
              <div><span className="text-gray-500">{t('customers.farm')}:</span> {selected.farm_company || '—'}</div>
              <div><span className="text-gray-500">{t('customers.balance')}:</span> {fmt(selected.account_balance)}</div>
              <div><span className="text-gray-500">{t('customers.creditLimit')}:</span> {fmt(selected.credit_limit)}</div>
            </div>
            {selected.notes && (
              <div className="text-sm"><span className="text-gray-500">{t('common.notes')}:</span> {selected.notes}</div>
            )}

            {canSendReports && (
              <div className="border rounded-lg p-4 space-y-3 bg-primary-50/40 dark:bg-primary-950/20">
                <h4 className="font-semibold flex items-center gap-2">
                  <Send size={16} /> {t('customers.readyReportsSection')}
                </h4>
                {readyLoading ? (
                  <p className="text-sm text-gray-500">{t('common.loading')}</p>
                ) : readyReports.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('customers.noReadyReports')}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3 items-center text-sm">
                      <label className="font-medium">{t('customers.sendChannel')}:</label>
                      <select
                        value={sendChannel}
                        onChange={(e) => setSendChannel(e.target.value)}
                        className="input-field w-auto text-sm"
                      >
                        <option value="whatsapp">{t('customers.channelWhatsapp')}</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b text-start">
                            <th className="p-2 font-medium">{t('reports.reportNo')}</th>
                            <th className="p-2 font-medium">{t('customers.reportType')}</th>
                            <th className="p-2 font-medium">{t('customers.approvalDate')}</th>
                            <th className="p-2 font-medium">{t('customers.sendStatusLabel')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readyReports.map((report) => (
                            <tr key={report.id} className="border-b">
                              <td className="p-2 font-medium">{report.report_number}</td>
                              <td className="p-2">{report.report_type || report.test_names || '—'}</td>
                              <td className="p-2">
                                {report.approved_at
                                  ? new Date(report.approved_at).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-GB')
                                  : '—'}
                              </td>
                              <td className="p-2">{formatSendStatus(report)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {unsentReports.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmSendOpen(true)}
                          disabled={sendingReports || skippingReports}
                          className="btn-primary inline-flex items-center gap-2 text-sm"
                        >
                          <MessageCircle size={16} />
                          {t('customers.sendAllReadyReports')}
                        </button>
                        {canSkipReadyReports && (
                          <button
                            type="button"
                            onClick={() => setConfirmSkipOpen(true)}
                            disabled={sendingReports || skippingReports}
                            className="btn-secondary inline-flex items-center gap-2 text-sm"
                          >
                            <Ban size={16} />
                            {t('customers.skipAllReadyReports')}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <h4 className="font-semibold">{t('customers.financialStatement')}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                [t('billing.total'), selected.financial_statement?.total_invoiced],
                [t('billing.paid'), selected.financial_statement?.total_paid],
                [t('billing.balanceDue'), selected.financial_statement?.balance_due],
                [t('customers.creditLimit'), selected.credit_limit],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm">
                  <p className="text-gray-500 text-xs mb-1">{label}</p>
                  <p className={`font-bold ${label === t('billing.balanceDue') ? 'text-amber-700' : ''}`}>{fmt(val)}</p>
                </div>
              ))}
            </div>

            {(selected.invoices?.length > 0) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Receipt size={16} /> {t('customers.invoices')}
                  </h4>
                  <Link to="/accounting" className="text-primary-600 text-xs hover:underline" onClick={() => setProfileOpen(false)}>
                    {t('nav.accounting')}
                  </Link>
                </div>
                <div className="border rounded-lg overflow-x-auto text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-primary-50 dark:bg-primary-900/20 border-b text-start">
                        <th className="p-2 font-medium">{t('billing.invoice')}</th>
                        <th className="p-2 font-medium">{t('common.date')}</th>
                        <th className="p-2 font-medium">{t('billing.total')}</th>
                        <th className="p-2 font-medium">{t('billing.paid')}</th>
                        <th className="p-2 font-medium">{t('billing.balanceDue')}</th>
                        <th className="p-2 font-medium">{t('common.status')}</th>
                        <th className="p-2 font-medium">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.invoices.map((inv) => (
                        <tr key={inv.id} className="border-b">
                          <td className="p-2 font-medium">{inv.invoice_number}</td>
                          <td className="p-2">{new Date(inv.created_at).toLocaleDateString()}</td>
                          <td className="p-2">{fmt(inv.total)}</td>
                          <td className="p-2 text-green-700">{fmt(inv.total_paid)}</td>
                          <td className="p-2 text-amber-700">{fmt(inv.balance_due)}</td>
                          <td className="p-2">
                            <StatusBadge status={inv.status} label={t(`billing.invoiceStatus.${inv.status}`, { defaultValue: inv.status })} />
                          </td>
                          <td className="p-2">
                            <button type="button" onClick={() => billingAPI.openInvoicePdf(inv.id)} className="text-primary-600 text-xs hover:underline">PDF</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(selected.payments?.length > 0) && (
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <CreditCard size={16} /> {t('customers.paymentHistory')}
                </h4>
                <div className="border rounded-lg overflow-x-auto text-sm max-h-48 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b text-start sticky top-0">
                        <th className="p-2 font-medium">{t('common.date')}</th>
                        <th className="p-2 font-medium">{t('billing.invoice')}</th>
                        <th className="p-2 font-medium">{t('billing.paymentMethod')}</th>
                        <th className="p-2 font-medium">{t('billing.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.payments.map((p) => (
                        <tr key={p.id} className="border-b">
                          <td className="p-2">{new Date(p.created_at).toLocaleString()}</td>
                          <td className="p-2">{p.invoice_number || '—'}</td>
                          <td className="p-2">{t(`billing.paymentMethods.${p.method}`, { defaultValue: p.method })}</td>
                          <td className="p-2 font-medium text-green-700">{fmt(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <h4 className="font-semibold">Animals ({selected.animals?.length || 0})</h4>
            <div className="text-sm space-y-1">
              {selected.animals?.map((a) => <p key={a.id}>{a.animal_code} - {a.animal_type} ({a.name_tag})</p>)}
            </div>
            <h4 className="font-semibold">Recent Samples</h4>
            <div className="text-sm space-y-1">
              {selected.samples?.slice(0, 5).map((s) => <p key={s.id}>{s.sample_code} - {s.status}</p>)}
            </div>
            <Link
              to={`/workflow?customer=${selected.id}`}
              className="btn-primary inline-flex items-center gap-2 text-sm mt-2"
              onClick={() => setProfileOpen(false)}
            >
              <Route size={16} /> {t('workflow.startCase')}
            </Link>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={confirmSendOpen}
        onClose={() => setConfirmSendOpen(false)}
        title={t('customers.confirmSendTitle')}
        size="md"
      >
        <div className="space-y-3 text-sm">
          <p>{t('customers.confirmSendIntro')}</p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-1">
            <p><strong>{t('customers.confirmReportCount')}:</strong> {unsentReports.length}</p>
            <p><strong>{t('customers.confirmRecipient')}:</strong> {customerDisplayName}</p>
            <p><strong>{t('customers.mobile')}:</strong> {selected?.mobile}</p>
            <p><strong>{t('customers.confirmChannel')}:</strong> {channelLabel(sendChannel, t)}</p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setConfirmSendOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button
              type="button"
              onClick={() => sendAllReadyReports(false)}
              disabled={sendingReports}
              className="btn-primary"
            >
              {sendingReports ? t('common.loading') : t('customers.confirmSendAction')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmSkipOpen}
        onClose={() => { setConfirmSkipOpen(false); setSkipReason(''); }}
        title={t('customers.confirmSkipTitle')}
        size="md"
      >
        <div className="space-y-3 text-sm">
          <p>{t('customers.confirmSkipIntro')}</p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-1">
            <p><strong>{t('customers.confirmReportCount')}:</strong> {unsentReports.length}</p>
            <p><strong>{t('customers.confirmRecipient')}:</strong> {customerDisplayName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('customers.skipReason')}</label>
            <input
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              className="input-field"
              placeholder={t('customers.skipReasonPlaceholder')}
              maxLength={500}
            />
          </div>
          <p className="text-xs text-gray-500">{t('customers.confirmSkipNote')}</p>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => { setConfirmSkipOpen(false); setSkipReason(''); }}
              className="btn-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={skipAllReadyReports}
              disabled={skippingReports}
              className="btn-primary"
            >
              {skippingReports ? t('common.loading') : t('customers.confirmSkipAction')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={resendOpen}
        onClose={() => setResendOpen(false)}
        title={t('customers.resendTitle')}
        size="md"
      >
        <div className="space-y-3 text-sm">
          <p>
            {t('customers.resendBody', {
              date: previousSend?.sentAt
                ? new Date(previousSend.sentAt).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-GB')
                : '—',
            })}
          </p>
          <p className="font-medium">{t('customers.resendQuestion')}</p>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setResendOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button
              type="button"
              onClick={() => sendAllReadyReports(true)}
              disabled={sendingReports}
              className="btn-primary"
            >
              {sendingReports ? t('common.loading') : t('common.yes')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
