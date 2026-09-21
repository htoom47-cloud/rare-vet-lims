import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [serviceType, setServiceType] = useState('all');
  const [serviceKey, setServiceKey] = useState('all');

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
  const serviceRows = sales?.by_service || [];
  const typeOptions = useMemo(() => {
    const present = new Set(serviceRows.map((row) => row.type).filter(Boolean));
    return ['field_visit', 'lab_test', 'package', 'other'].filter((type) => present.has(type));
  }, [serviceRows]);
  const serviceOptions = useMemo(() => {
    const list = serviceType === 'all' ? serviceRows : serviceRows.filter((row) => row.type === serviceType);
    return list.map((row) => ({ key: row.key, type: row.type, name: row.service_name }));
  }, [serviceRows, serviceType]);
  const visibleServices = useMemo(() => {
    return serviceRows.filter((row) => {
      if (serviceType !== 'all' && row.type !== serviceType) return false;
      if (serviceKey !== 'all' && row.key !== serviceKey) return false;
      return true;
    });
  }, [serviceRows, serviceType, serviceKey]);
  const filteredTotals = useMemo(() => ({
    revenue: visibleServices.reduce((sum, row) => sum + (parseFloat(row.revenue) || 0), 0),
    quantity: visibleServices.reduce((sum, row) => sum + (parseFloat(row.quantity) || 0), 0),
    lines: visibleServices.reduce((sum, row) => sum + (parseInt(row.line_count, 10) || 0), 0),
  }), [visibleServices]);
  const serviceLabel = (row) => (
    row.type === 'field_visit' ? t('opsReports.serviceTypes.field_visit') : (row.service_name || row.name || '—')
  );

  const onTypeChange = (nextType) => {
    setServiceType(nextType);
    setServiceKey('all');
  };

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
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <h2 className="text-sm font-semibold">{t('opsReports.byService')}</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="text-sm">
                <span className="block text-gray-500 mb-1">{t('opsReports.serviceTypeFilter')}</span>
                <select className="input-field min-w-[180px]" value={serviceType} onChange={(e) => onTypeChange(e.target.value)}>
                  <option value="all">{t('opsReports.allTypes')}</option>
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>{t(`opsReports.serviceTypes.${type}`)}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-gray-500 mb-1">{t('opsReports.serviceFilter')}</span>
                <select className="input-field min-w-[220px]" value={serviceKey} onChange={(e) => setServiceKey(e.target.value)}>
                  <option value="all">{t('opsReports.allServices')}</option>
                  {serviceOptions.map((row) => (
                    <option key={row.key} value={row.key}>{serviceLabel(row)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {(serviceType !== 'all' || serviceKey !== 'all') && (
            <div className="flex flex-wrap gap-2">
              <SummaryCard label={t('opsReports.filteredRevenue')} value={fmt(filteredTotals.revenue)} />
              <SummaryCard label={t('opsReports.quantity')} value={filteredTotals.quantity} />
              <SummaryCard label={t('accounting.lineCount')} value={filteredTotals.lines} />
            </div>
          )}
          <ReportTable
            headers={[t('opsReports.serviceTypeFilter'), t('accounting.service'), t('opsReports.quantity'), t('opsReports.revenue'), t('accounting.lineCount')]}
            rows={visibleServices.map((row) => [
              t(`opsReports.serviceTypes.${row.type}`, { defaultValue: row.type }),
              serviceLabel(row),
              row.quantity,
              fmt(row.revenue),
              row.line_count,
            ])}
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
