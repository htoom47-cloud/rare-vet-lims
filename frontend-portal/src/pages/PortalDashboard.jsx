import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PawPrint, FileText, Bell, AlertTriangle, ChevronLeft, ChevronRight,
  CheckCircle2, Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import KpiCard from '../components/portal/KpiCard';
import StatusBadge from '../components/portal/StatusBadge';
import { portalDashboardAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';
import { cn } from '../lib/utils';

export default function PortalDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';
  const Chevron = isAr ? ChevronLeft : ChevronRight;

  useEffect(() => {
    portalDashboardAPI.get()
      .then(({ data: res }) => setData(res.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const alertText = (alert) => {
    if (alert.type === 'new_reports') return t('portal.alertNewReports', { count: alert.count });
    if (alert.type === 'critical_results') return t('portal.alertCritical', { count: alert.count });
    if (alert.type === 'abnormal_panels') return t('portal.alertAbnormal', { count: alert.count });
    return '';
  };

  const topAlert = useMemo(() => {
    if (!data?.alerts?.length) return null;
    const priority = { critical: 0, warning: 1, info: 2 };
    return [...data.alerts].sort((a, b) => (priority[a.severity] ?? 9) - (priority[b.severity] ?? 9))[0];
  }, [data]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const quickActions = [
    { to: '/reports', icon: FileText, label: t('portal.navReports') },
    { to: '/animals', icon: PawPrint, label: t('portal.navAnimals') },
    { to: '/invoices', icon: Receipt, label: t('portal.navInvoices') },
  ];

  const needsAttention = (data?.stats?.animalsNeedingFollowUp ?? 0) + (data?.stats?.abnormalResults ?? 0);

  return (
    <PortalLayout compact wide>
      <div className="med-page space-y-4">
        {loading && (
          <div className="text-center py-10 med-loading text-sm">{t('common.loading')}</div>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {quickActions.map(({ to, icon: Icon, label }) => (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(to)}
                  className="portal-quick-action"
                >
                  <span className="portal-quick-action__icon">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-foreground leading-tight">{label}</span>
                </button>
              ))}
            </div>

            {topAlert && (
              <div
                className={cn(
                  'portal-alert-banner flex items-start gap-3 px-4 py-3 rounded-xl border text-sm',
                  topAlert.severity === 'critical'
                    ? 'portal-alert-banner--critical'
                    : 'portal-alert-banner--warning'
                )}
              >
                {topAlert.severity === 'critical' ? (
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                ) : (
                  <Bell size={18} className="shrink-0 mt-0.5" />
                )}
                <p className="font-medium leading-relaxed">{alertText(topAlert)}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <KpiCard compact icon={PawPrint} label={t('portal.statAnimals')} value={data.stats.animalCount} accent="purple" />
              <KpiCard compact icon={FileText} label={t('portal.statReports')} value={data.stats.reportCount} accent="blue" />
              <KpiCard
                compact
                icon={AlertTriangle}
                label={t('portal.kpiFollowUp')}
                value={needsAttention}
                accent={needsAttention > 0 ? 'orange' : 'neutral'}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
              <section className="xl:col-span-2 xl:order-2 med-section-card order-1">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                  <h2 className="text-sm font-bold text-foreground">{t('portal.recentReports')}</h2>
                  <button
                    type="button"
                    className="text-xs text-primary-600 dark:text-primary-400 font-semibold flex items-center gap-0.5 hover:underline"
                    onClick={() => navigate('/reports')}
                  >
                    {t('portal.viewAll')} <Chevron size={14} />
                  </button>
                </div>
                <div className="divide-y divide-border/60">
                  {(data.recentReports || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">{t('portal.noReports')}</p>
                  ) : (
                    data.recentReports.map((report) => (
                      <button
                        key={report.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/50 text-start transition-colors"
                        onClick={() => navigate(`/reports/${report.id}`)}
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
                          <FileText size={18} className="text-primary-600 dark:text-primary-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-base text-foreground truncate">
                            {report.animal_name || report.report_number}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {[animalLabel(report.animal_type, isAr), report.report_number, formatDate(report.created_at)]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <CheckCircle2
                          size={16}
                          className={report.is_final ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'}
                        />
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="xl:col-span-3 xl:order-1 med-section-card order-2">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                  <h2 className="text-sm font-bold text-foreground">{t('portal.myAnimals')}</h2>
                  <button
                    type="button"
                    className="text-xs text-primary-600 dark:text-primary-400 font-semibold flex items-center gap-0.5 hover:underline"
                    onClick={() => navigate('/animals')}
                  >
                    {t('portal.viewAll')} <Chevron size={14} />
                  </button>
                </div>

                {data.animals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">{t('portal.noAnimals')}</p>
                ) : (
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {data.animals.map((animal) => (
                      <button
                        key={animal.id}
                        type="button"
                        className="med-animal-tile text-start rounded-xl p-4"
                        onClick={() => navigate(`/animals/${animal.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-bold text-foreground truncate leading-tight">
                              {animal.name || animalLabel(animal.type, isAr)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {animal.name ? animalLabel(animal.type, isAr) : animal.code}
                              {animal.name && animal.code ? ` · ${animal.code}` : ''}
                            </p>
                          </div>
                          <StatusBadge
                            status={animal.overallStatus === 'unknown' ? 'none' : (animal.overallStatus || 'none')}
                            className="shrink-0"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                          <span>{t('portal.reportCount', { count: animal.reportCount })}</span>
                          {animal.latestReportAt && <span>{formatDate(animal.latestReportAt)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
