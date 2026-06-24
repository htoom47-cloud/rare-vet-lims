import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Route, Receipt, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import StatusBadge from '../components/ui/StatusBadge';
import { customersAPI, billingAPI } from '../services/api';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

export default function Customers() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ full_name: '', mobile: '', city: '', farm_company: '', notes: '', credit_limit: 0 });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selected?.id) {
        await customersAPI.update(selected.id, form);
        toast.success('Customer updated');
      } else {
        await customersAPI.create(form);
        toast.success('Customer created');
      }
      setModalOpen(false);
      setForm({ full_name: '', mobile: '', city: '', farm_company: '', notes: '', credit_limit: 0 });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    }
  };

  const viewProfile = async (customer) => {
    const { data } = await customersAPI.get(customer.id);
    setSelected(data.data);
    setProfileOpen(true);
  };

  const columns = [
    { key: 'full_name', label: t('customers.fullName') },
    { key: 'mobile', label: t('customers.mobile') },
    { key: 'city', label: t('customers.city') },
    { key: 'farm_company', label: t('customers.farm') },
    { key: 'account_balance', label: t('customers.balance'), render: (r) => `SAR ${parseFloat(r.account_balance).toFixed(2)}` },
    { key: 'animal_count', label: 'Animals' },
    { key: 'actions', label: t('common.actions'), render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); viewProfile(r); }} className="text-primary-600 text-sm hover:underline">{t('common.view')}</button>
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
          <button onClick={() => { setSelected(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('common.add')}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={customers} loading={loading} onRowClick={viewProfile} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('common.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {['full_name', 'mobile', 'city', 'farm_company'].map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1">{t(`customers.${field === 'farm_company' ? 'farm' : field === 'full_name' ? 'fullName' : field}`)}</label>
              <input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="input-field" required={field === 'full_name' || field === 'mobile'} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={profileOpen} onClose={() => setProfileOpen(false)} title={selected?.full_name} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('customers.mobile')}:</span> {selected.mobile}</div>
              <div><span className="text-gray-500">{t('customers.city')}:</span> {selected.city}</div>
              <div><span className="text-gray-500">{t('customers.balance')}:</span> SAR {parseFloat(selected.account_balance).toFixed(2)}</div>
              <div><span className="text-gray-500">Credit Limit:</span> SAR {parseFloat(selected.credit_limit).toFixed(2)}</div>
            </div>
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
    </div>
  );
}
