import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import LaboratoryReport from './LaboratoryReport';
import PortalLayout from '../components/portal/PortalLayout';
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
      <PortalLayout title={t('common.loading')}>
        <Skeleton className="h-10 w-48 mb-4" />
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </PortalLayout>
    );
  }

  if (!report) return null;

  return (
    <PortalLayout title={report.reportNumber}>
      <LaboratoryReport initialReport={report} backPath="/reports" />
    </PortalLayout>
  );
}
