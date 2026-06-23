import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import LaboratoryReport from './LaboratoryReport';
import { Skeleton } from '../components/ui/skeleton';
import { portalReportsAPI } from '../services/portalApi';

export default function PortalReportView() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalReportsAPI.getPreview(id)
      .then(({ data }) => setReport(data.data))
      .catch(() => toast.error(t('labReport.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

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
      <LaboratoryReport initialReport={report} backPath="/reports" />
    </div>
  );
}
