import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Route, Receipt, CreditCard, Pencil, Send, MessageCircle } from 'lucide-react';
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

export default function Customers() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('customers.update');
  const canSendReports = hasPermission('notifications.send_report');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [sendOpen, setSendOpen] = useState(false);
  const [readyReports, setReadyReports] = useState([]);
  const [readyLoading, setReadyLoading] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState([]);
  const [sendingReports, setSendingReports] = useState(false);
  const [sendChannel, setSendChannel] = useState('whatsapp');

  const load = () => {
    setLoading(true);
    const trimmed = search.trim();
    const looksLikeMobile = /^[\d+\s()-]{3,}$/.test(trimmed);
    const params = looksLikeMobile ? { mobile: trimmed } : { search: trimmed };
    customersAPI.list(params).then(({ data }) => setCustomers(data.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

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
  };

  const openSendReports = async () => {
    if (!selected?.id) return;
    setSendOpen(true);
    setReadyLoading(true);
    setSelectedReportIds([]);
    try {
      const { data } = await customersAPI.readyReports(selected.id);
      const reports = data.data?.reports || [];
      setReadyReports(reports);
      setSelectedReportIds(reports.filter((r) => !r.previously_sent).map((r) => r.id));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
      setSendOpen(false);
    } finally {
      setReadyLoading(false);
    }
  };

  const toggleReportSelection = (reportId) => {
    setSelectedReportIds((prev) => (
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    ));
  };

  const sendSelectedReports = async (forceResend = false) => {
    if (!selected?.id || selectedReportIds.length === 0) {
      toast.error(t('customers.selectReportsToSend'));
      return;
    }
    setSendingReports(true);
    try {
      await customersAPI.sendReadyReports(selected.id, {
        reportIds: selectedReportIds,
        channel: sendChannel,
        forceResend,
      });
      toast.success(t('customers.reportsSentSuccess'));
      setSendOpen(false);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ALREADY_SENT' && !forceResend) {
        const confirmed = window.confirm(t('customers.reportsAlreadySentConfirm'));
        if (confirmed) await sendSelectedReports(true);
      } else {
        toast.error(err.response?.data?.error?.message || t('common.error'));
      }
    } finally {
      setSendingReports(false);
    }
  };

  const columns = [
    { key: 'full_name', label: t('customers.fullName') },
    { key: 'mobile', label: t('customers.mobile') },
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

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{t('customers.title')}</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="tel"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('customers.searchByMobile')}
              className="input-field ps-10"
            />
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('common.add')}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={customers} loading={loading} onRowClick={viewProfile} />

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
            {canSendReports && (
              <button
                type="button"
                onClick={openSendReports}
                className="btn-secondary inline-flex items-center gap-2 text-sm mt-2 ms-2"
              >
                <Send size={16} /> {t('customers.sendReadyReports')}
              </button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        title={t('customers.sendReadyReports')}
        size="lg"
      >
        {readyLoading ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : readyReports.length === 0 ? (
          <p className="text-sm text-gray-500">{t('customers.noReadyReports')}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t('customers.sendReadyReportsHint')}</p>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-sm font-medium">{t('customers.sendChannel')}:</label>
              <select
                value={sendChannel}
                onChange={(e) => setSendChannel(e.target.value)}
                className="input-field w-auto text-sm"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
              <button
                type="button"
                onClick={() => setSelectedReportIds(readyReports.filter((r) => !r.previously_sent).map((r) => r.id))}
                className="text-primary-600 text-xs hover:underline"
              >
                {t('customers.selectAllUnsent')}
              </button>
            </div>
            <div className="border rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-start sticky top-0">
                    <th className="p-2 w-10" />
                    <th className="p-2 font-medium">{t('reports.reportNo')}</th>
                    <th className="p-2 font-medium">{t('customers.animal')}</th>
                    <th className="p-2 font-medium">{t('reports.tests')}</th>
                    <th className="p-2 font-medium">{t('common.date')}</th>
                    <th className="p-2 font-medium">{t('common.status')}</th>
                    <th className="p-2 font-medium">{t('customers.sentBefore')}</th>
                  </tr>
                </thead>
                <tbody>
                  {readyReports.map((report) => (
                    <tr key={report.id} className="border-b">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedReportIds.includes(report.id)}
                          onChange={() => toggleReportSelection(report.id)}
                        />
                      </td>
                      <td className="p-2 font-medium">{report.report_number}</td>
                      <td className="p-2">{report.animal_name || '—'}</td>
                      <td className="p-2">{report.test_names || '—'}</td>
                      <td className="p-2">{new Date(report.created_at).toLocaleDateString()}</td>
                      <td className="p-2">{report.status}</td>
                      <td className="p-2">
                        {report.previously_sent ? (
                          <span className="text-green-700">{t('common.yes')}</span>
                        ) : (
                          <span className="text-gray-500">{t('common.no')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={() => setSendOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button
                type="button"
                onClick={() => sendSelectedReports(false)}
                disabled={sendingReports || selectedReportIds.length === 0}
                className="btn-primary inline-flex items-center gap-2"
              >
                <MessageCircle size={16} />
                {sendingReports ? t('common.loading') : t('customers.sendOneMessage')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
