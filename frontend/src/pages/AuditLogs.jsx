import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DataTable from '../components/ui/DataTable';
import { auditAPI } from '../services/api';

export default function AuditLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditAPI.list().then(({ data }) => setLogs(data.data)).finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'created_at', label: t('common.date'), render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'user_name', label: t('audit.user') },
    { key: 'action', label: t('audit.action') },
    { key: 'module', label: t('audit.module') },
    { key: 'entity_type', label: 'Entity' },
    { key: 'entity_id', label: 'Entity ID', render: (r) => r.entity_id?.slice(0, 8) || '-' },
    { key: 'ip_address', label: 'IP' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('audit.title')}</h1>
      <DataTable columns={columns} data={logs} loading={loading} />
    </div>
  );
}
