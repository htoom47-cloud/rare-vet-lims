import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import LaboratoryReport from './LaboratoryReport';
import { Skeleton } from '../components/ui/skeleton';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/** Dev-only: load a real report from the database without login */
export default function ReportLive() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      setLoading(false);
      return;
    }
    axios.get(`${API_URL}/reports/${id}/preview-dev`)
      .then(({ data }) => setReport(data.data))
      .catch(() => toast.error(t('labReport.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (!import.meta.env.DEV) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
        {t('labReport.loadFailed')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="min-h-screen bg-background bg-app-mesh p-3 sm:p-6">
      <LaboratoryReport demoMode initialReport={report} />
    </div>
  );
}
