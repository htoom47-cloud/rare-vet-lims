import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PawPrint, FileText, Bell, AlertTriangle, ChevronLeft, ChevronRight,
  Activity, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import KpiCard from '../components/portal/KpiCard';
import StatusBadge from '../components/portal/StatusBadge';
import { portalDashboardAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

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

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short',
    });
  };

  const customerName = isAr
    ? (data?.customer?.full_name_ar || data?.customer?.full_name)
    : data?.customer?.full_name;

  return (
    <PortalLayout compact alertCount={data?.alerts?.length || 0} wide>
      <div className="med-page space-y-3">
        <div className="med-hero rounded-xl border border-slate-200/80 bg-white shadow-sm px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('portal.dashboard')}
          </p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">
            {customerName ? `${t('portal.welcomeBack')}, ${customerName}` : t('portal.dashboard')}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('portal.dashboardHint')}</p>
        </div>

        {loading && (
          <div className="text-center py-10 text-slate-500 text-sm">{t('common.loading')}</div>
        )}

        {!loading && data && (
          <>
            {data.alerts?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.alerts.map((alert) => (
                  <div
                    key={alert.type}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
                      alert.severity === 'critical'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {alert.severity === 'critical' ? <AlertTriangle size={14} /> : <Bell size={14} />}
                    {alertText(alert)}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <KpiCard compact icon={PawPrint} label={t('portal.statAnimals')} value={data.stats.animalCount} accent="primary" />
              <KpiCard compact icon={FileText} label={t('portal.statReports')} value={data.stats.reportCount} accent="info" />
              <KpiCard compact icon={Bell} label={t('portal.statNew')} value={data.stats.newReports7d} accent="success" />
              <KpiCard
                compact
                icon={AlertTriangle}
                label={t('portal.kpiAbnormal')}
                value={data.stats.abnormalResults ?? 0}
                accent={(data.stats.abnormalResults ?? 0) > 0 ? 'danger' : 'default'}
              />
              <KpiCard
                compact
                icon={Activity}
                label={t('portal.kpiFollowUp')}
                value={data.stats.animalsNeedingFollowUp ?? 0}
                accent={(data.stats.animalsNeedingFollowUp ?? 0) > 0 ? 'warning' : 'default'}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
              <section className="xl:col-span-3 med-section-card">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
                  <h2 className="med-section-title mb-0">{t('portal.myAnimals')}</h2>
                  <button
                    type="button"
                    className="text-xs text-[#302419] font-semibold flex items-center gap-0.5 hover:underline"
                    onClick={() => navigate('/animals')}
                  >
                    {t('portal.viewAll')} <Chevron size={14} />
                  </button>
                </div>

                {data.animals.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">{t('portal.noAnimals')}</p>
                ) : (
                  <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {data.animals.map((animal) => (
                      <button
                        key={animal.id}
                        type="button"
                        className="med-animal-tile text-start rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm hover:shadow-md hover:border-[#C5A059]/40 transition-all"
                        onClick={() => navigate(`/animals/${animal.id}`)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="font-bold font-mono text-sm text-slate-900">{animal.code}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {animalLabel(animal.type, isAr)}
                              {animal.name ? ` · ${animal.name}` : ''}
                            </p>
                          </div>
                          <StatusBadge
                            status={animal.overallStatus === 'unknown' ? 'none' : (animal.overallStatus || 'none')}
                            className="scale-90 origin-top-end"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(animal.panels || []).filter((p) => p.status !== 'none').slice(0, 4).map((panel) => (
                            <span
                              key={panel.key}
                              className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium border ${
                                panel.status === 'normal' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                panel.status === 'attention' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                'bg-rose-50 text-rose-700 border-rose-100'
                              }`}
                            >
                              {t(`portal.panels.${panel.key}`)}
                              {panel.abnormal > 0 ? ` (${panel.abnormal})` : ''}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400">
                            {t('portal.reportCount', { count: animal.reportCount })}
                          </span>
                          {animal.abnormalCount > 0 && (
                            <span className="text-[10px] font-semibold text-rose-600">
                              {animal.abnormalCount} {t('portal.outOfRangeShort')}
                            </span>
                          )}
                          {animal.latestReportAt && (
                            <span className="text-[10px] text-slate-400">{formatDate(animal.latestReportAt)}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="xl:col-span-2 med-section-card">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
                  <h2 className="med-section-title mb-0">{t('portal.recentReports')}</h2>
                  <button
                    type="button"
                    className="text-xs text-[#302419] font-semibold hover:underline"
                    onClick={() => navigate('/reports')}
                  >
                    {t('portal.viewAll')}
                  </button>
                </div>
                <div className="divide-y divide-slate-50">
                  {(data.recentReports || []).length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">{t('portal.noReports')}</p>
                  ) : (
                    data.recentReports.map((report) => (
                      <button
                        key={report.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80 text-start"
                        onClick={() => navigate(`/reports/${report.id}`)}
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#302419]/5 flex items-center justify-center shrink-0">
                          <FileText size={14} className="text-[#302419]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-semibold text-slate-800">{report.report_number}</p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {report.animal_code} · {formatDate(report.created_at)}
                          </p>
                        </div>
                        <CheckCircle2
                          size={14}
                          className={report.is_final ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'}
                        />
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
