import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, ClipboardList, FlaskConical, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingAPI } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import { labDay, labMonth } from '../utils/accountingTime';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;
const monthStart = () => `${labMonth()}-01`;

function SummaryCard({ label, value }) {
  return (
    <div className="card p-4 min-w-[140px] flex-1">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function ReportTable({ headers, rows, empty }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-start dark:bg-gray-800">
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

export default function OpsReports() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith('ar');
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => labDay());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await billingAPI.operationsReport({ from, to });
      setReport(data.data);
    } catch {
      toast.error(t('opsReports.loadFailed'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => { load(); }, [load]);

  const testName = (row) => (ar ? (row.name_ar || row.name) : (row.name || row.name_ar)) || row.code || '—';
  const sales = report?.sales;
  const tests = report?.tests;
  const samples = report?.samples;

  const tabs = [
    { id: 'sales', icon: Receipt, label: t('opsReports.sales') },
    { id: 'tests', icon: FlaskConical, label: t('opsReports.tests') },
    { id: 'other', icon: ClipboardList, label: t('opsReports.other') },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('opsReports.title')}
        subtitle={t('opsReports.subtitle')}
        action={(
          <Link to="/accounting" className="btn-secondary flex items-center gap-2 text-sm">
            <BarChart3 size={16} /> {t('nav.accounting')}
          </Link>
        )}
      />

      <div className="card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="block text-gray-500 mb-1">{t('opsReports.from')}</span>
          <input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex-1 text-sm">
          <span className="block text-gray-500 mb-1">{t('opsReports.to')}</span>
          <input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="btn-secondary" onClick={() => { setFrom(monthStart()); setTo(labDay()); }}>
          {t('opsReports.thisMonth')}
        </button>
        <button type="button" className="btn-primary" onClick={load} disabled={loading}>
          {t('opsReports.apply')}
        </button>
      </div>
      <p className="text-xs text-gray-500">{t('opsReports.rangeHint')}</p>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-primary-600 text-white' : 'bg-white border hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center py-10 text-gray-500">{t('common.loading')}</p>}

      {!loading && report && tab === 'sales' && sales && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SummaryCard label={t('opsReports.invoices')} value={sales.invoice_count} />
            <SummaryCard label={t('opsReports.invoiced')} value={fmt(sales.invoiced_total)} />
            <SummaryCard label={t('opsReports.collected')} value={fmt(sales.collections_total)} />
            <SummaryCard label={t('opsReports.discount')} value={fmt(sales.discount_total)} />
            <SummaryCard label={t('opsReports.tax')} value={fmt(sales.tax_total)} />
            <SummaryCard label={t('opsReports.cancelledInvoices')} value={sales.cancelled_count} />
          </div>
          <h2 className="text-sm font-semibold">{t('opsReports.byMethod')}</h2>
          <ReportTable
            headers={[t('billing.paymentMethod'), t('opsReports.collected')]}
            rows={(sales.by_method || []).map((row) => [
              t(`billing.paymentMethods.${row.method}`, { defaultValue: row.method }),
              fmt(row.total),
            ])}
            empty={t('opsReports.noData')}
          />
          <h2 className="text-sm font-semibold">{t('opsReports.byService')}</h2>
          <ReportTable
            headers={[t('accounting.service'), t('opsReports.revenue'), t('accounting.lineCount')]}
            rows={(sales.by_service || []).map((row) => [row.service_name, fmt(row.revenue), row.line_count])}
            empty={t('opsReports.noData')}
          />
          <h2 className="text-sm font-semibold">{t('opsReports.byCustomer')}</h2>
          <ReportTable
            headers={[t('customers.fullName'), t('accounting.invoiceCount'), t('accounting.invoiced'), t('accounting.collected')]}
            rows={(sales.by_customer || []).map((row) => [row.full_name, row.invoice_count, fmt(row.invoiced), fmt(row.collected)])}
            empty={t('opsReports.noData')}
          />
        </div>
      )}

      {!loading && report && tab === 'tests' && tests && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SummaryCard label={t('opsReports.testCount')} value={tests.test_count} />
          </div>
          <h2 className="text-sm font-semibold">{t('opsReports.topTests')}</h2>
          <ReportTable
            headers={[t('nav.tests'), t('opsReports.quantity')]}
            rows={(tests.top_tests || []).map((row) => [testName(row), row.count])}
            empty={t('opsReports.noData')}
          />
          <h2 className="text-sm font-semibold">{t('opsReports.billedTests')}</h2>
          <ReportTable
            headers={[t('nav.tests'), t('opsReports.quantity'), t('opsReports.revenue'), t('accounting.lineCount')]}
            rows={(tests.billed_tests || []).map((row) => [testName(row), row.quantity, fmt(row.revenue), row.line_count])}
            empty={t('opsReports.noData')}
          />
        </div>
      )}

      {!loading && report && tab === 'other' && samples && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SummaryCard label={t('opsReports.sampleCount')} value={samples.sample_count} />
            <SummaryCard label={t('opsReports.approvedReports')} value={samples.approved_reports} />
          </div>
          <h2 className="text-sm font-semibold">{t('opsReports.samplesByStatus')}</h2>
          <ReportTable
            headers={[t('common.status'), t('opsReports.quantity')]}
            rows={(samples.by_status || []).map((row) => [
              t(`samples.statuses.${row.status}`, { defaultValue: row.status }),
              row.count,
            ])}
            empty={t('opsReports.noData')}
          />
        </div>
      )}
    </div>
  );
}
