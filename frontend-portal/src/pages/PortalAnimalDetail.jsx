import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, ArrowRight, Activity, AlertTriangle, CheckCircle2, FileText, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import AnimalHeroHeader from '../components/portal/AnimalHeroHeader';
import KpiCard from '../components/portal/KpiCard';
import HealthPanelCard from '../components/portal/HealthPanelCard';
import ClinicalInsight from '../components/portal/ClinicalInsight';
import ParameterChangeRow from '../components/portal/ParameterChangeRow';
import TrendChart from '../components/portal/TrendChart';
import MiniSparkline from '../components/portal/MiniSparkline';
import { Button } from '../components/ui/button';
import { portalAnimalsAPI } from '../services/portalApi';

export default function PortalAnimalDetail() {
  const { animalId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [sparklines, setSparklines] = useState({});
  const [selectedParam, setSelectedParam] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    portalAnimalsAPI.dashboard(animalId)
      .then(({ data }) => {
        setDashboard(data.data);
        const first = data.data.trendCandidates?.[0];
        if (first) setSelectedParam(first);
      })
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [animalId, t]);

  useEffect(() => {
    if (!selectedParam || !animalId) return;
    portalAnimalsAPI.trends(animalId, selectedParam)
      .then(({ data }) => setTrendData(data.data))
      .catch(() => setTrendData(null));
  }, [animalId, selectedParam]);

  const sparkCandidates = useMemo(
    () => (dashboard?.trendCandidates || []).slice(0, 3),
    [dashboard]
  );

  useEffect(() => {
    if (!animalId || !sparkCandidates.length) return;
    Promise.all(
      sparkCandidates.map((code) =>
        portalAnimalsAPI.trends(animalId, code, 12)
          .then(({ data }) => [code, data.data])
          .catch(() => [code, null])
      )
    ).then((rows) => {
      const map = {};
      rows.forEach(([code, data]) => { map[code] = data; });
      setSparklines(map);
    });
  }, [animalId, sparkCandidates]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const kpis = dashboard?.kpis;

  return (
    <PortalLayout compact wide>
      <div className="med-page space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-slate-600" onClick={() => navigate('/animals')}>
            <BackIcon size={15} /> {t('labReport.back')}
          </Button>
        </div>

        {loading && (
          <div className="text-center py-10 text-slate-500 text-sm">{t('common.loading')}</div>
        )}

        {!loading && dashboard && (
          <>
            <AnimalHeroHeader
              animal={dashboard.animal}
              owner={dashboard.owner}
              latestReport={dashboard.latestReport}
              kpis={kpis}
              animalId={animalId}
              canCompare={dashboard.canCompare}
              isAr={isAr}
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <KpiCard
                compact
                icon={FileText}
                label={t('portal.testsCount')}
                value={kpis?.reportCount ?? 0}
                accent="primary"
              />
              <KpiCard
                compact
                icon={CheckCircle2}
                label={t('portal.kpiNormal')}
                value={kpis?.normalCount ?? 0}
                accent="success"
                hint={t('portal.kpiLatestReport')}
              />
              <KpiCard
                compact
                icon={AlertTriangle}
                label={t('portal.kpiAbnormal')}
                value={kpis?.abnormalCount ?? 0}
                accent={kpis?.abnormalCount > 0 ? 'danger' : 'default'}
                hint={t('portal.outOfRangeShort')}
              />
              <KpiCard
                compact
                icon={Activity}
                label={t('portal.kpiPanels')}
                value={`${kpis?.panelsOk ?? 0}/${dashboard.panels?.filter((p) => p.status !== 'none').length || 0}`}
                accent={kpis?.panelsAlert > 0 ? 'warning' : 'success'}
                hint={t('portal.kpiPanelsHint')}
              />
            </div>

            <section className="med-section">
              <h2 className="med-section-title">{t('portal.healthSummary')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                {(dashboard.panels || []).map((panel) => (
                  <HealthPanelCard key={panel.key} panel={panel} compact />
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="xl:col-span-2 space-y-3">
                {(dashboard.trendCandidates?.length > 0) && (
                  <section className="med-section-card p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h2 className="med-section-title mb-0 flex items-center gap-1.5">
                        <TrendingUp size={16} className="text-[#C5A059]" />
                        {t('portal.trendChart')}
                      </h2>
                      <select
                        className="h-8 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 max-w-[11rem]"
                        value={selectedParam || ''}
                        onChange={(e) => setSelectedParam(e.target.value)}
                      >
                        {dashboard.trendCandidates.map((code) => {
                          const p = dashboard.keyParameters?.find((x) => x.code === code);
                          const label = p ? (isAr ? p.nameAr : p.nameEn) : code;
                          return <option key={code} value={code}>{label || code}</option>;
                        })}
                      </select>
                    </div>
                    <TrendChart data={trendData} meta={trendData?.meta} isAr={isAr} height={220} bare />
                  </section>
                )}

                {sparkCandidates.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {sparkCandidates.map((code) => {
                      const p = dashboard.keyParameters?.find((x) => x.code === code);
                      const data = sparklines[code];
                      const name = p ? (isAr ? p.nameAr : p.nameEn) : code;
                      const color = p?.latestFlag && !['NORMAL', 'NEG'].includes(p.latestFlag) ? '#e11d48' : '#C5A059';
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`med-spark-card text-start p-2.5 rounded-xl border bg-white shadow-sm transition-all ${
                            selectedParam === code ? 'border-[#C5A059] ring-1 ring-[#C5A059]/30' : 'border-slate-200/80'
                          }`}
                          onClick={() => setSelectedParam(code)}
                        >
                          <p className="text-[11px] font-semibold text-slate-700 truncate">{name}</p>
                          <p className="text-lg font-bold tabular-nums text-slate-900 mt-0.5">{p?.current ?? '—'}</p>
                          <MiniSparkline points={data?.points} color={color} height={36} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {dashboard.interpretation && (
                  <ClinicalInsight interpretation={dashboard.interpretation} isAr={isAr} compact />
                )}

                {dashboard.keyParameters?.length > 0 && (
                  <section className="med-section-card p-3">
                    <h2 className="med-section-title">{t('portal.historicalComparison')}</h2>
                    <div className="divide-y divide-slate-100">
                      {dashboard.keyParameters.slice(0, 5).map((param) => (
                        <ParameterChangeRow key={param.code} param={param} isAr={isAr} compact />
                      ))}
                    </div>
                    {dashboard.keyParameters.length > 5 && dashboard.canCompare && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 h-8 text-xs text-[#302419]"
                        onClick={() => navigate(`/animals/${animalId}/compare`)}
                      >
                        {t('portal.viewAllCompare')}
                      </Button>
                    )}
                  </section>
                )}
              </div>
            </div>

            <section className="med-section-card">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
                <h2 className="med-section-title mb-0">{t('portal.reportHistory')}</h2>
                <span className="text-[11px] text-slate-400">{dashboard.recentReports?.length || 0}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {(dashboard.recentReports || []).map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50/80 text-start transition-colors"
                    onClick={() => navigate(`/reports/${report.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-slate-800">{report.report_number}</p>
                      <p className="text-[11px] text-slate-400">{report.sample_code} · {formatDate(report.created_at)}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      report.is_final
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                    >
                      {report.is_final ? t('labReport.final') : t('labReport.preliminary')}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
