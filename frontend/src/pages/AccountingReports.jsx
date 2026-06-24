import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Calendar, Users, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from '../services/api';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

export default function AccountingReports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('collections');
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState(null);
  const [arAging, setArAging] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [journal, setJournal] = useState([]);
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'collections') {
        const { data } = await billingAPI.collectionsReport({ date: collectionDate });
        setCollections(data.data);
      } else if (tab === 'ar') {
        const { data } = await billingAPI.arAgingReport();
        setArAging(data.data);
      } else if (tab === 'revenue') {
        const { data } = await billingAPI.revenueReport();
        setRevenue(data.data);
      } else if (tab === 'journal') {
        const { data } = await billingAPI.journalReport();
        setJournal(data.data);
      }
    } catch {
      toast.error(t('accounting.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab, collectionDate]);

  const tabs = [
    { id: 'collections', icon: Calendar, label: t('accounting.collections') },
    { id: 'ar', icon: Users, label: t('accounting.arAging') },
    { id: 'revenue', icon: BarChart3, label: t('accounting.revenue') },
    { id: 'journal', icon: BookOpen, label: t('accounting.journal') },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('accounting.title')}</h1>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'collections' && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t('accounting.date')}</label>
          <input
            type="date"
            className="input-field"
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
          />
        </div>
      )}

      {loading && <div className="text-center py-10 text-gray-500">{t('common.loading')}</div>}

      {!loading && tab === 'collections' && collections && (
        <div className="space-y-4">
          <div className="card p-4 flex flex-wrap gap-6">
            <div>
              <p className="text-sm text-gray-500">{t('accounting.totalCollected')}</p>
              <p className="text-2xl font-bold text-green-700">{fmt(collections.total)}</p>
            </div>
            {Object.entries(collections.by_method || {}).map(([method, amount]) => (
              <div key={method}>
                <p className="text-sm text-gray-500">{t(`billing.paymentMethods.${method}`, { defaultValue: method })}</p>
                <p className="text-lg font-semibold">{fmt(amount)}</p>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-start">
                  <th className="p-3">{t('billing.invoice')}</th>
                  <th className="p-3">{t('nav.customers')}</th>
                  <th className="p-3">{t('billing.paymentMethod')}</th>
                  <th className="p-3">{t('billing.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {collections.payments.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-3">{p.invoice_number}</td>
                    <td className="p-3">{p.customer_name}</td>
                    <td className="p-3">{t(`billing.paymentMethods.${p.method}`, { defaultValue: p.method })}</td>
                    <td className="p-3 font-medium">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {collections.payments.length === 0 && (
              <p className="p-6 text-center text-gray-500">{t('accounting.noData')}</p>
            )}
          </div>
        </div>
      )}

      {!loading && tab === 'ar' && arAging && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['accounting.totalAr', arAging.totals.balance_due],
              ['accounting.bucket0_30', arAging.totals.bucket_0_30],
              ['accounting.bucket31_60', arAging.totals.bucket_31_60],
              ['accounting.bucket61plus', arAging.totals.bucket_61_plus],
            ].map(([key, val]) => (
              <div key={key} className="card p-4">
                <p className="text-xs text-gray-500">{t(key)}</p>
                <p className="text-lg font-bold">{fmt(val)}</p>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-start">
                  <th className="p-3">{t('nav.customers')}</th>
                  <th className="p-3">{t('accounting.openInvoices')}</th>
                  <th className="p-3">{t('billing.balanceDue')}</th>
                  <th className="p-3">0-30</th>
                  <th className="p-3">31-60</th>
                  <th className="p-3">61+</th>
                </tr>
              </thead>
              <tbody>
                {arAging.customers.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-3">{c.full_name}</td>
                    <td className="p-3">{c.open_invoices}</td>
                    <td className="p-3 font-medium text-amber-700">{fmt(c.balance_due)}</td>
                    <td className="p-3">{fmt(c.bucket_0_30)}</td>
                    <td className="p-3">{fmt(c.bucket_31_60)}</td>
                    <td className="p-3">{fmt(c.bucket_61_plus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'revenue' && revenue && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-sm text-gray-500">{t('accounting.invoiced')}</p>
            <p className="text-2xl font-bold">{fmt(revenue.invoiced_total)}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">{t('accounting.collected')}</p>
            <p className="text-2xl font-bold text-green-700">{fmt(revenue.collections_total)}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">{t('billing.tax')}</p>
            <p className="text-2xl font-bold">{fmt(revenue.tax_total)}</p>
          </div>
          {revenue.by_method?.length > 0 && (
            <div className="card p-4 md:col-span-3">
              <h3 className="font-semibold mb-3">{t('accounting.byMethod')}</h3>
              <div className="flex flex-wrap gap-4">
                {revenue.by_method.map((row) => (
                  <div key={row.method}>
                    <span className="text-sm text-gray-500">{t(`billing.paymentMethods.${row.method}`, { defaultValue: row.method })}: </span>
                    <strong>{fmt(row.total)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'journal' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-start">
                <th className="p-3">{t('accounting.date')}</th>
                <th className="p-3">{t('accounting.description')}</th>
                <th className="p-3">{t('accounting.source')}</th>
                <th className="p-3">{t('accounting.debit')}</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-3">{new Date(e.entry_date).toLocaleDateString()}</td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3">{e.source_type}</td>
                  <td className="p-3">{fmt(e.total_debit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journal.length === 0 && <p className="p-6 text-center text-gray-500">{t('accounting.noData')}</p>}
        </div>
      )}
    </div>
  );
}
