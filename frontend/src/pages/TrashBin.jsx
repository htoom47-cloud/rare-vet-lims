import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { RotateCcw, Trash2 } from 'lucide-react';
import DataTable from '../components/ui/DataTable';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { trashAPI } from '../services/api';

const TABS = ['customers', 'samples', 'reports', 'invoices'];

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

  const handleDelete = async () => {
    const id = deleteId.trim();
    if (!id) return;
    if (!window.confirm(t('trash.deleteConfirm'))) return;
    setBusyId(id);
    try {
      await trashAPI.delete(activeTab, id);
      toast.success(t('trash.deleted'));
      setDeleteId('');
      await loadTrash();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('trash.deleteFailed'));
    } finally {
      setBusyId(null);
    }
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
        <div className="mb-6 flex flex-wrap gap-2 items-end p-4 rounded-2xl border border-border/60 bg-card">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('trash.deleteById')}
            </label>
            <input
              type="text"
              value={deleteId}
              onChange={(e) => setDeleteId(e.target.value)}
              placeholder={t('trash.idPlaceholder')}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={!deleteId.trim() || busyId === deleteId.trim()}>
            {t('trash.moveToTrash')}
          </Button>
        </div>
      )}

      <DataTable columns={columns} data={rows} loading={loading} />
    </div>
  );
}
