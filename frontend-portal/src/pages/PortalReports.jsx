import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import ReportListCard from '../components/portal/ReportListCard';
import { Card, CardContent } from '../components/ui/card';
import { portalReportsAPI } from '../services/portalApi';

export default function PortalReports() {
  const { t, i18n } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    portalReportsAPI.list({ limit: 100 })
      .then(({ data }) => setReports(data.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <PortalLayout title={t('portal.myReports')} subtitle={t('portal.reportsHint')} wide>
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && reports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('portal.noReports')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {!loading && reports.map((report) => (
          <ReportListCard key={report.id} report={report} isAr={isAr} />
        ))}
      </div>
    </PortalLayout>
  );
}
