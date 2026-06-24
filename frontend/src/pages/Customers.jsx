import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import { customersAPI } from '../services/api';

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
            <div className="text-sm grid grid-cols-2 gap-2 mb-3">
              <div><span className="text-gray-500">{t('billing.total')}:</span> SAR {(selected.financial_statement?.total_invoiced || 0).toFixed(2)}</div>
              <div><span className="text-gray-500">{t('billing.paid')}:</span> SAR {(selected.financial_statement?.total_paid || 0).toFixed(2)}</div>
              <div><span className="text-gray-500">{t('billing.balanceDue')}:</span> <strong className="text-amber-700">SAR {(selected.financial_statement?.balance_due || 0).toFixed(2)}</strong></div>
              <div><span className="text-gray-500">{t('customers.creditLimit')}:</span> SAR {parseFloat(selected.credit_limit).toFixed(2)}</div>
            </div>
            {selected.invoices?.length > 0 && (
              <>
                <h4 className="font-semibold text-sm">{t('billing.invoice')}</h4>
                <div className="text-sm space-y-1 mb-3 max-h-32 overflow-y-auto">
                  {selected.invoices.slice(0, 8).map((inv) => (
                    <p key={inv.id} className="flex justify-between gap-2">
                      <span>{inv.invoice_number}</span>
                      <span>SAR {parseFloat(inv.balance_due || 0).toFixed(2)}</span>
                    </p>
                  ))}
                </div>
              </>
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
