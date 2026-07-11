import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { RotateCcw, Search, Trash2 } from 'lucide-react';
import DataTable from '../components/ui/DataTable';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import {
  billingAPI, customersAPI, reportsAPI, samplesAPI, trashAPI,
} from '../services/api';

const TABS = ['customers', 'samples', 'reports', 'invoices'];

async function searchActiveRecords(type, q) {
  const query = q.trim();
  if (!query) return [];

  if (type === 'customers') {
    const { data } = await customersAPI.list({ search: query, limit: 20 });
    return data.data || [];
  }
  if (type === 'samples') {
    const { data } = await samplesAPI.list({ search: query, limit: 20 });
    return data.data || [];
  }
  if (type === 'invoices') {
    const { data } = await billingAPI.invoices({ search: query, limit: 20 });
    return data.data || [];
  }
  const { data } = await reportsAPI.list({ limit: 100 });
  const ql = query.toLowerCase();
  return (data.data || []).filter((r) => (
    r.report_number?.toLowerCase().includes(ql)
    || r.sample_code?.toLowerCase().includes(ql)
    || r.customer_name?.toLowerCase().includes(ql)
  )).slice(0, 20);
}

function activeLabel(type, row) {
  if (type === 'customers') return row.full_name || row.mobile;
  if (type === 'samples') return row.sample_code || row.barcode;
  if (type === 'reports') return row.report_number || row.sample_code;
  return row.invoice_number;
}

function formatCountdown(purgeAfter, t) {
  if (!purgeAfter) return '—';
  const ms = new Date(purgeAfter).getTime() - Date.now();
  if (ms <= 0) return t('trash.purgePending');
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return t('trash.countdown', { hours, minutes });
}

export default function TrashBin() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const enabled = !!user?.features?.softDeleteEnabled;
  const canManage = hasPermission('data.trash.manage');

  const [activeTab, setActiveTab] = useState('customers');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const retentionHours = user?.features?.softDeleteRetentionHours ?? 48;

  const loadTrash = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await trashAPI.list(activeTab);
      setRows(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.loadFailed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, enabled, t]);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, [activeTab]);

  const moveToTrash = async (id) => {
    if (!window.confirm(t('trash.deleteConfirm'))) return;
    setBusyId(id);
    try {
      await trashAPI.delete(activeTab, id);
      toast.success(t('trash.deleted'));
      setDeleteId('');
      setSearchResults((prev) => prev.filter((r) => r.id !== id));
      await loadTrash();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchActiveRecords(activeTab, searchQuery);
      setSearchResults(results);
      if (!results.length) toast.error(t('trash.noSearchResults'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.searchFailed'));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleRestore = async (row) => {
    setBusyId(row.id);
    try {
      await trashAPI.restore(activeTab, row.id);
      toast.success(t('trash.restored'));
      await loadTrash();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.restoreFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (row) => {
    if (!window.confirm(t('trash.purgeConfirm', { name: labelForRow(row) }))) return;
    setBusyId(row.id);
    try {
      await trashAPI.purge(activeTab, row.id);
      toast.success(t('trash.purged'));
      await loadTrash();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.purgeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handlePurgeExpired = async () => {
    if (!window.confirm(t('trash.purgeExpiredConfirm'))) return;
    setBusyId('purge-expired');
    try {
      const { data } = await trashAPI.purgeExpired();
      const p = data?.data?.purged || {};
      toast.success(t('trash.purgeExpiredDone', {
        customers: p.customers || 0,
        samples: p.samples || 0,
        reports: p.reports || 0,
        invoices: p.invoices || 0,
      }));
      await loadTrash();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.purgeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const id = deleteId.trim();
    if (!id) return;
    await moveToTrash(id);
  };

  const labelForRow = (row) => {
    if (activeTab === 'customers') return row.full_name || row.mobile;
    if (activeTab === 'samples') return row.sample_code || row.barcode;
    if (activeTab === 'reports') return row.report_number || row.sample_code;
    return row.invoice_number;
  };

  const columns = [
    {
      key: 'label',
      label: t('trash.record'),
      render: (r) => (
        <div>
          <p className="font-medium">{labelForRow(r)}</p>
          {r.customer_name && <p className="text-xs text-muted-foreground">{r.customer_name}</p>}
        </div>
      ),
    },
    {
      key: 'deleted_at',
      label: t('trash.deletedAt'),
      render: (r) => new Date(r.deleted_at).toLocaleString(),
    },
    {
      key: 'deleted_by_name',
      label: t('trash.deletedBy'),
      render: (r) => r.deleted_by_name || '—',
    },
    {
      key: 'purge_after',
      label: t('trash.purgeIn'),
      render: (r) => formatCountdown(r.purge_after, t),
    },
    ...(canManage ? [{
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busyId === r.id}
            onClick={(e) => { e.stopPropagation(); handleRestore(r); }}
          >
            <RotateCcw size={14} className="me-1" />
            {t('trash.restore')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busyId === r.id}
            onClick={(e) => { e.stopPropagation(); handlePurge(r); }}
          >
            <Trash2 size={14} className="me-1" />
            {t('trash.purgeNow')}
          </Button>
        </div>
      ),
    }] : []),
  ];

  if (!enabled) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">{t('trash.title')}</h1>
        <p className="text-muted-foreground">{t('trash.disabled')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 size={24} />
            {t('trash.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('trash.subtitle', { hours: retentionHours })}
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="destructive"
            disabled={busyId === 'purge-expired'}
            onClick={handlePurgeExpired}
          >
            {t('trash.purgeExpired')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-primary-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {t(`trash.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {canManage && (
        <div className="mb-6 p-4 rounded-2xl border border-border/60 bg-card space-y-4">
          <p className="text-sm font-semibold">{t('trash.searchAndDelete')}</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('trash.searchLabel')}
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder={t(`trash.searchPlaceholder.${activeTab}`)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
            </div>
            <Button type="button" onClick={handleSearch} disabled={!searchQuery.trim() || searching}>
              <Search size={16} className="me-1" />
              {searching ? t('common.loading') : t('trash.search')}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-start px-3 py-2 font-medium">{t('trash.record')}</th>
                    <th className="text-start px-3 py-2 font-medium">{t('trash.details')}</th>
                    <th className="text-end px-3 py-2 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {searchResults.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium">{activeLabel(activeTab, row)}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {activeTab === 'customers' && row.mobile}
                        {activeTab === 'samples' && (row.customer_name || row.barcode)}
                        {activeTab === 'reports' && row.customer_name}
                        {activeTab === 'invoices' && (row.customer_name || row.total)}
                      </td>
                      <td className="px-3 py-2 text-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busyId === row.id}
                          onClick={() => moveToTrash(row.id)}
                        >
                          {t('trash.moveToTrash')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {t('trash.deleteByIdAdvanced')}
            </summary>
            <div className="flex flex-wrap gap-2 items-end mt-3 pt-3 border-t border-border/60">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={deleteId}
                  onChange={(e) => setDeleteId(e.target.value)}
                  placeholder={t('trash.idPlaceholder')}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm font-mono text-xs"
                />
              </div>
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={!deleteId.trim() || busyId === deleteId.trim()}>
                {t('trash.moveToTrash')}
              </Button>
            </div>
          </details>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">{t('trash.inTrash')}</h2>

      <DataTable columns={columns} data={rows} loading={loading} />
    </div>
  );
}
