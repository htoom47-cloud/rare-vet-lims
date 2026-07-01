import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, FlaskConical, CreditCard, Search, BarChart3, Tags, Monitor, Usb, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CustomerSearch from '../components/customers/CustomerSearch';
import { samplesAPI } from '../services/api';

export default function ReceptionHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, hasAnyPermission, hasPermission } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [recentSamples, setRecentSamples] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    samplesAPI.list({ limit: 8, page: 1 })
      .then(({ data }) => setRecentSamples(data.data || []))
      .finally(() => setLoading(false));
  }, []);

  const startWithCustomer = () => {
    if (customerId) navigate(`/workflow?customer=${customerId}`);
    else navigate('/workflow');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-primary-800 dark:text-primary-100">
          {t('reception.welcome', { name: user?.full_name_ar || user?.full_name })}
        </h1>
        <p className="text-primary-500 mt-1">{t('reception.subtitle')}</p>
      </div>

      <button
        onClick={() => navigate('/workflow')}
        className="w-full card-interactive p-6 mb-6 flex items-center gap-4 text-start border-2 border-primary-200 dark:border-primary-600"
      >
        <div className="w-14 h-14 rounded-2xl bg-primary-600 text-white flex items-center justify-center shrink-0">
          <Plus size={28} />
        </div>
        <div>
          <p className="text-lg font-bold text-primary-800 dark:text-primary-100">{t('reception.newCase')}</p>
          <p className="text-sm text-primary-500">{t('reception.newCaseHint')}</p>
        </div>
      </button>

      <div className="card p-5 mb-6">
        <p className="font-semibold mb-2 flex items-center gap-2">
          <Search size={18} /> {t('reception.quickSearch')}
        </p>
        <p className="text-xs text-primary-500 mb-3">{t('customers.searchMobileHint')}</p>
        <CustomerSearch value={customerId} onChange={setCustomerId} autoFocus={false} />
        <button
          onClick={startWithCustomer}
          disabled={!customerId}
          className="btn-primary w-full mt-4 py-3"
        >
          {t('reception.continueWithCustomer')}
        </button>
      </div>

      <a
        href="/reception-display"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full card-interactive p-5 mb-6 flex items-center gap-4 text-start border border-primary-200/80 dark:border-primary-700 no-underline"
      >
        <div className="w-12 h-12 rounded-xl bg-primary-500/15 text-primary-600 flex items-center justify-center shrink-0">
          <Monitor size={24} />
        </div>
        <div>
          <p className="font-bold text-primary-800 dark:text-primary-100">{t('reception.openDisplay')}</p>
          <p className="text-sm text-primary-500">{t('reception.openDisplayHint')}</p>
        </div>
      </a>

      <a
        href="/reception-display-usb/index.html"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full card-interactive p-5 mb-6 flex items-center gap-4 text-start border border-dashed border-primary-300/80 dark:border-primary-600 no-underline"
      >
        <div className="w-12 h-12 rounded-xl bg-primary-500/15 text-primary-600 flex items-center justify-center shrink-0">
          <Usb size={24} />
        </div>
        <div>
          <p className="font-bold text-primary-800 dark:text-primary-100">{t('reception.usbDisplay')}</p>
          <p className="text-sm text-primary-500">{t('reception.usbDisplayHint')}</p>
        </div>
      </a>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={() => navigate('/samples')} className="card p-4 flex flex-col items-center gap-2 hover:bg-primary-50">
          <FlaskConical className="text-primary-600" size={24} />
          <span className="text-sm font-medium">{t('reception.viewSamples')}</span>
        </button>
        {hasPermission('reports.view') && (
          <button onClick={() => navigate('/reports')} className="card p-4 flex flex-col items-center gap-2 hover:bg-primary-50">
            <FileText className="text-primary-600" size={24} />
            <span className="text-sm font-medium">{t('nav.reports')}</span>
          </button>
        )}
        {hasAnyPermission('price_list.view', 'tests.view') && (
        <button onClick={() => navigate('/price-list')} className="card p-4 flex flex-col items-center gap-2 hover:bg-primary-50">
          <Tags className="text-primary-600" size={24} />
          <span className="text-sm font-medium">{t('nav.priceList')}</span>
        </button>
        )}
        <button onClick={() => navigate('/billing')} className="card p-4 flex flex-col items-center gap-2 hover:bg-primary-50">
          <CreditCard className="text-primary-600" size={24} />
          <span className="text-sm font-medium">{t('reception.billing')}</span>
        </button>
        <button onClick={() => navigate('/accounting')} className="card p-4 flex flex-col items-center gap-2 hover:bg-primary-50">
          <BarChart3 className="text-primary-600" size={24} />
          <span className="text-sm font-medium">{t('nav.accounting')}</span>
        </button>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">{t('reception.recentSamples')}</h3>
        {loading ? (
          <p className="text-sm text-primary-500">{t('common.loading')}</p>
        ) : recentSamples.length === 0 ? (
          <p className="text-sm text-primary-500">{t('reception.noSamplesYet')}</p>
        ) : (
          <div className="space-y-2">
            {recentSamples.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/samples?id=${s.id}`)}
                className="w-full text-start px-3 py-2 rounded-lg hover:bg-primary-50 flex justify-between items-center text-sm"
              >
                <span className="font-medium">{s.sample_code}</span>
                <span className="text-primary-500 text-xs">{s.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
