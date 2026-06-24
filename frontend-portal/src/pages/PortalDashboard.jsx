import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PawPrint, FileText, Bell, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import ReportListCard from '../components/portal/ReportListCard';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { portalDashboardAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <Card className="portal-stat-card">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon size={22} />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

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

  return (
    <PortalLayout
      title={t('portal.dashboard')}
      subtitle={t('portal.dashboardHint')}
      alertCount={data?.alerts?.length || 0}
      wide
    >
      {loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          {data.alerts?.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((alert) => (
                <div
                  key={alert.type}
                  className={`portal-alert flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                    alert.severity === 'critical' ? 'portal-alert-critical' : 'portal-alert-info'
                  }`}
                >
                  {alert.severity === 'critical' ? <AlertTriangle size={18} /> : <Bell size={18} />}
                  <span>{alertText(alert)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={PawPrint}
              label={t('portal.statAnimals')}
              value={data.stats.animalCount}
              accent="bg-primary/10 text-primary"
            />
            <StatCard
              icon={FileText}
              label={t('portal.statReports')}
              value={data.stats.reportCount}
              accent="bg-amber-500/10 text-amber-700 dark:text-amber-400"
            />
            <StatCard
              icon={Bell}
              label={t('portal.statNew')}
              value={data.stats.newReports7d}
              accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            />
          </div>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">{t('portal.myAnimals')}</h2>
              <button
                type="button"
                className="text-sm text-primary font-medium flex items-center gap-1"
                onClick={() => navigate('/animals')}
              >
                {t('portal.viewAll')} <Chevron size={16} />
              </button>
            </div>
            {data.animals.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                  {t('portal.noAnimals')}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.animals.map((animal) => (
                  <Card
                    key={animal.id}
                    className="portal-animal-card cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => navigate(`/animals/${animal.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div>
                          <p className="font-bold font-mono">{animal.code}</p>
                          <p className="text-sm text-muted-foreground">
                            {animalLabel(animal.type, isAr)}
                            {animal.name ? ` · ${animal.name}` : ''}
                          </p>
                        </div>
                        {animal.hasAbnormal && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 font-medium">
                            {t('portal.needsFollowUp')}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(animal.panels || []).filter((p) => p.status !== 'none').map((panel) => (
                          <span
                            key={panel.key}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              panel.status === 'normal' ? 'bg-emerald-500/10 text-emerald-700' :
                              panel.status === 'attention' ? 'bg-amber-500/10 text-amber-700' :
                              'bg-rose-500/10 text-rose-700'
                            }`}
                          >
                            {t(`portal.panels.${panel.key}`)}
                          </span>
                        ))}
                        <span className="text-xs text-muted-foreground ms-auto">
                          {t('portal.reportCount', { count: animal.reportCount })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('portal.recentReports')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data.recentReports || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t('portal.noReports')}</p>
                ) : (
                  data.recentReports.map((report) => (
                    <ReportListCard key={report.id} report={report} isAr={isAr} compact />
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </PortalLayout>
  );
}
