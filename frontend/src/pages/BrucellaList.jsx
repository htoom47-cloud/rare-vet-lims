import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Save, Send, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import CustomerSearch from '../components/customers/CustomerSearch';
import { resultsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { printBrucellaList } from '../utils/brucellaListPrint';

const NEGATIVE = 'لا توجد مالطيه';
const LEGACY_NEGATIVE = 'سلبي';
const POSITIVE = 'إيجابي';

export default function BrucellaList() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canEnter = hasPermission('results.enter') || hasPermission('results.edit');
  const canApprove = hasPermission('results.validate');
  const canPublish = canApprove || hasPermission('notifications.send_report');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (id = customerId) => {
    if (!id) {
      toast.error(t('brucellaList.pickCustomer'));
      return;
    }
    setLoading(true);
    try {
      const { data } = await resultsAPI.brucellaList({ customer_id: id, from, to });
      const list = data.data || [];
      setRows(list);
      setDrafts(Object.fromEntries(list.map((row) => [row.sample_test_id, row.result_value || ''])));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('brucellaList.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const changedRows = (approve) => rows
    .map((row) => ({
      sample_test_id: row.sample_test_id,
      value: drafts[row.sample_test_id] || '',
      previous: row.result_value || '',
      is_validated: row.is_validated,
    }))
    .filter((row) => {
      if (row.value !== NEGATIVE && row.value !== POSITIVE) return false;
      if (row.value !== row.previous) return true;
      return approve && !row.is_validated;
    });

  const save = async (approve) => {
    const payload = changedRows(approve);
    if (!payload.length) {
      toast.error(t('brucellaList.nothingToSave'));
      return;
    }
    setSaving(true);
    try {
      const call = approve ? resultsAPI.approveBrucellaList : resultsAPI.saveBrucellaList;
      const { data } = await call({
        customer_id: customerId,
        rows: payload.map((row) => ({ sample_test_id: row.sample_test_id, value: row.value })),
      });
      const result = data.data || {};
      toast.success(t('brucellaList.saved', { saved: result.saved || 0, failed: result.failed?.length || 0 }));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('brucellaList.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const fillEmpty = () => {
    setDrafts((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        if (!next[row.sample_test_id]) next[row.sample_test_id] = NEGATIVE;
      });
      return next;
    });
  };

  const publish = async () => {
    const ready = rows.some((row) => row.result_value);
    if (!customerId || !ready) {
      toast.error(t('brucellaList.nothingToPrint'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await resultsAPI.publishBrucellaList({ customer_id: customerId, from, to });
      toast.success(t('brucellaList.published', { count: data.data?.row_count || 0 }));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('brucellaList.publishFailed'));
    } finally {
      setSaving(false);
    }
  };

  const printList = () => {
    const printable = rows.filter((row) => row.result_value);
    if (!printable.length) {
      toast.error(t('brucellaList.nothingToPrint'));
      return;
    }
    try {
      printBrucellaList({
        customerName,
        rows: printable,
        labels: {
          title: t('brucellaList.printTitle'),
          reportType: t('brucellaList.reportType'),
          customer: t('brucellaList.owner'),
          exam: t('brucellaList.exam'),
          examName: t('parasitology.brucellaSection'),
          date: t('brucellaList.date'),
          summary: t('brucellaList.summary'),
          count: t('brucellaList.count'),
          sample: t('brucellaList.sample'),
          animal: t('brucellaList.animal'),
          animalName: t('animals.name'),
          result: t('brucellaList.result'),
          positive: t('brucellaList.positive'),
          negative: t('brucellaList.negative'),
          empty: t('brucellaList.empty'),
          note: t('brucellaList.printNote'),
          disclaimer: t('brucellaList.disclaimer'),
        },
      });
    } catch (err) {
      toast.error(err?.code === 'POPUP_BLOCKED' ? t('brucellaList.popupBlocked') : t('brucellaList.printFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('brucellaList.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('brucellaList.subtitle')}</p>
      </div>

      <div className="card p-4 space-y-3">
        <CustomerSearch
          value={customerId}
          onChange={(id, customer) => {
            setCustomerId(id || '');
            setCustomerName(customer?.full_name_ar || customer?.full_name || '');
            setRows([]);
          }}
        />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="text-sm flex-1">
            <span className="block text-gray-500 mb-1">{t('brucellaList.from')}</span>
            <input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm flex-1">
            <span className="block text-gray-500 mb-1">{t('brucellaList.to')}</span>
            <input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="btn-primary" onClick={() => load()} disabled={loading}>
            {loading ? t('common.loading') : t('brucellaList.load')}
          </button>
        </div>
      </div>

      {!!rows.length && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {canEnter && (
              <button type="button" className="btn-secondary text-sm" onClick={fillEmpty}>{t('brucellaList.fillNegative')}</button>
            )}
            {canEnter && (
              <button type="button" className="btn-primary text-sm flex items-center gap-2" onClick={() => save(false)} disabled={saving}>
                <Save size={16} /> {t('brucellaList.save')}
              </button>
            )}
            {canApprove && (
              <button type="button" className="btn-secondary text-sm flex items-center gap-2" onClick={() => save(true)} disabled={saving}>
                <ShieldCheck size={16} /> {t('brucellaList.approve')}
              </button>
            )}
            {canPublish && (
              <button type="button" className="btn-secondary text-sm flex items-center gap-2" onClick={publish} disabled={saving}>
                <Send size={16} /> {t('brucellaList.publish')}
              </button>
            )}
            <button type="button" className="btn-secondary text-sm flex items-center gap-2" onClick={printList}>
              <Printer size={16} /> {t('brucellaList.print')}
            </button>
            <span className="text-sm text-gray-500 self-center">{t('brucellaList.count')}: {rows.length}</span>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-start">
                  <th className="p-3">#</th>
                  <th className="p-3">{t('brucellaList.sample')}</th>
                  <th className="p-3">{t('brucellaList.animal')}</th>
                  <th className="p-3">{t('animals.name')}</th>
                  <th className="p-3">{t('brucellaList.result')}</th>
                  <th className="p-3">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.sample_test_id} className="border-b">
                    <td className="p-3">{index + 1}</td>
                    <td className="p-3 font-mono">{row.sample_code}</td>
                    <td className="p-3 font-mono">{row.animal_code}</td>
                    <td className="p-3">{row.animal_name || '—'}</td>
                    <td className="p-3">
                      <select
                        className="input-field"
                        value={drafts[row.sample_test_id] || ''}
                        disabled={!canEnter || row.is_validated}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [row.sample_test_id]: e.target.value }))}
                      >
                        <option value="">{t('brucellaList.unset')}</option>
                        <option value={NEGATIVE}>{t('brucellaList.negative')}</option>
                        {(drafts[row.sample_test_id] === LEGACY_NEGATIVE || row.result_value === LEGACY_NEGATIVE) && (
                          <option value={LEGACY_NEGATIVE}>{LEGACY_NEGATIVE}</option>
                        )}
                        <option value={POSITIVE}>{t('brucellaList.positive')}</option>
                      </select>
                    </td>
                    <td className="p-3">{row.is_validated ? t('brucellaList.approved') : t('brucellaList.pending')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
