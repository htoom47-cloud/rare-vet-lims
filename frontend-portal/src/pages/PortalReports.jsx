import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import ReportListCard from '../components/portal/ReportListCard';
import { Card, CardContent } from '../components/ui/card';
import { portalReportsAPI, portalDashboardAPI } from '../services/portalApi';

export default function PortalReports() {
  const { t, i18n } = useTranslation();
  const [reports, setReports] = useState([]);
  const [newReportCount, setNewReportCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const reportsRes = await portalReportsAPI.list({ limit: 100 });
        if (!cancelled) setReports(reportsRes.data.data || []);
      } catch {
        if (!cancelled) {
          setReports([]);
          toast.error(t('portal.loadFailed'));
        }
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Alerts are optional — dashboard failures must not hide the report list.
      try {
        const dashRes = await portalDashboardAPI.get();
        if (cancelled) return;
        const newAlert = dashRes.data.data?.alerts?.find((a) => a.type === 'new_reports');
        setNewReportCount(newAlert?.count || 0);
      } catch {
        if (!cancelled) setNewReportCount(0);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [t]);

  return (
    <PortalLayout title={t('portal.myReports')} subtitle={t('portal.reportsHint')} wide>
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && newReportCount > 0 && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-800 dark:bg-primary-900/30 dark:border-primary-700 dark:text-primary-100 text-sm font-medium">
          <Bell size={16} className="shrink-0" />
          {t('portal.alertNewReports', { count: newReportCount })}
        </div>
      )}

      {!loading && reports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('portal.noReports')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {!loading && reports.map((report) => (
          <ReportListCard key={report.id} report={report} isAr={isAr} compact />
        ))}
      </div>
    </PortalLayout>
  );
}
