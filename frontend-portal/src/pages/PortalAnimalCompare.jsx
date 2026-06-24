import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus, ArrowLeft, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import ClinicalInsight from '../components/portal/ClinicalInsight';
import ParameterChangeRow from '../components/portal/ParameterChangeRow';
import TrendChart from '../components/portal/TrendChart';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { portalAnimalsAPI, portalReportsAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

const flagClass = (flag) => {
  if (flag === 'H' || flag === 'POS' || String(flag).startsWith('CRIT')) return 'text-red-600 font-semibold';
  if (flag === 'L' || flag === 'NEG') return 'text-blue-600 font-semibold';
  return '';
};

const TrendIcon = ({ trend }) => {
  if (trend === 'up') return <ArrowUp size={14} className="text-emerald-600" />;
  if (trend === 'down') return <ArrowDown size={14} className="text-blue-600" />;
  if (trend === 'stable') return <Minus size={14} className="text-muted-foreground" />;
  return null;
};

export default function PortalAnimalCompare() {
  const { animalId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [chartParam, setChartParam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const isAr = i18n.language === 'ar';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    portalReportsAPI.list({ animalId, limit: 100 })
      .then(({ data }) => {
        const rows = data.data;
        setReports(rows);
        if (rows.length >= 2) {
          setSelected([rows[1].id, rows[0].id].filter(Boolean));
        }
      })
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [animalId, t]);

  const runCompare = async (ids) => {
    if (ids.length < 2) {
      toast.error(t('portal.selectTwoReports'));
      return;
    }
    setComparing(true);
    try {
      const { data } = await portalAnimalsAPI.compare(animalId, ids);
      setComparison(data.data);
      const first = data.data.parameters?.find((p) => p.comparable);
      if (first) setChartParam(first.code);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('portal.compareFailed'));
      setComparison(null);
    } finally {
      setComparing(false);
    }
  };

  useEffect(() => {
    if (selected.length >= 2 && !loading) {
      runCompare(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loading]);

  useEffect(() => {
    if (!chartParam || !animalId) return;
    portalAnimalsAPI.trends(animalId, chartParam, 20)
      .then(({ data }) => setTrendData(data.data))
      .catch(() => setTrendData(null));
  }, [animalId, chartParam]);

  const toggleReport = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) {
        toast.error(t('portal.maxCompare'));
        return prev;
      }
      return [...prev, id];
    });
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const animalName = comparison?.animal?.name || reports[0]?.animal_name;
  const animalCode = comparison?.animal?.code || reports[0]?.animal_code;
  const pageTitle = animalName || animalCode || t('portal.navCompare');
  const pageSubtitle = animalName && animalCode
    ? animalCode
    : (comparison?.animal?.type ? animalLabel(comparison.animal.type, isAr) : '');

  const numericParams = useMemo(
    () => (comparison?.parameters || []).filter((p) => p.comparable),
    [comparison]
  );
  const otherParams = useMemo(
    () => (comparison?.parameters || []).filter((p) => !p.comparable),
    [comparison]
  );

  const beforeAfter = useMemo(() => {
    if (!comparison?.reports?.length) return null;
    const reps = comparison.reports;
    return { before: reps[reps.length - 2], after: reps[reps.length - 1] };
  }, [comparison]);

  const topChanges = useMemo(
    () => numericParams
      .filter((p) => p.percentChange != null)
      .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
      .slice(0, 6),
    [numericParams]
  );

  const reportHeaderCell = (r) => (
    <th key={r.id} className="text-center py-2 px-2 font-medium min-w-[5.5rem]">
      <div className="font-mono text-xs">{r.reportNumber}</div>
      <div className="text-[10px] text-muted-foreground font-normal">{formatDate(r.date)}</div>
    </th>
  );

  const analysisDateRow = (extraCells = null) => (
    <tr className="border-b border-border/60 bg-muted/25">
      <td className="py-2.5 pe-3 font-medium text-muted-foreground sticky start-0 bg-muted/25 z-10 whitespace-nowrap">
        {t('portal.analysisDate')}
      </td>
      {comparison.reports.map((r) => (
        <td key={r.id} className="text-center py-2.5 px-2 text-sm whitespace-nowrap">
          {formatDate(r.date)}
        </td>
      ))}
      {extraCells}
    </tr>
  );

  return (
    <PortalLayout title={pageTitle} subtitle={pageSubtitle} wide compact>
      <Button variant="ghost" size="sm" className="mb-4 gap-1 -ms-2" onClick={() => navigate(`/animals/${animalId}`)}>
        <BackIcon size={16} /> {t('labReport.back')}
      </Button>

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && reports.length < 2 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('portal.needTwoReports')}
          </CardContent>
        </Card>
      )}

      {!loading && reports.length >= 2 && (
        <>
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('portal.selectReports')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {reports.map((r) => {
                const active = selected.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleReport(r.id)}
                    className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-card hover:bg-accent'
                    }`}
                  >
                    <span className="font-mono block">{r.report_number}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {comparing && (
            <div className="text-center py-8 text-muted-foreground text-sm">{t('common.loading')}</div>
          )}

          {!comparing && comparison && (
            <div className="space-y-4">
              {comparison.interpretation && (
                <ClinicalInsight interpretation={comparison.interpretation} isAr={isAr} />
              )}

              {beforeAfter && (
                <Card className="portal-before-after">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('portal.beforeAfter')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="portal-ba-col rounded-xl p-4 bg-muted/40">
                      <p className="text-xs text-muted-foreground uppercase">{isAr ? 'قبل' : 'Before'}</p>
                      <p className="font-mono font-bold mt-1">{beforeAfter.before?.reportNumber}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(beforeAfter.before?.date)}</p>
                    </div>
                    <div className="portal-ba-col rounded-xl p-4 bg-primary/5 border border-primary/20">
                      <p className="text-xs text-muted-foreground uppercase">{isAr ? 'بعد' : 'After'}</p>
                      <p className="font-mono font-bold mt-1">{beforeAfter.after?.reportNumber}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(beforeAfter.after?.date)}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {topChanges.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('portal.historicalComparison')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topChanges.map((param) => (
                      <ParameterChangeRow key={param.code} param={param} isAr={isAr} />
                    ))}
                  </CardContent>
                </Card>
              )}

              {numericParams.length > 0 && chartParam && (
                <div>
                  <select
                    className="input-field text-sm h-9 w-auto max-w-xs mb-3"
                    value={chartParam}
                    onChange={(e) => setChartParam(e.target.value)}
                  >
                    {numericParams.map((p) => (
                      <option key={p.code} value={p.code}>
                        {isAr ? p.nameAr : p.nameEn}
                      </option>
                    ))}
                  </select>
                  <TrendChart data={trendData} meta={trendData?.meta} isAr={isAr} />
                </div>
              )}

              {numericParams.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('portal.numericCompare')}</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-sm border-collapse min-w-[36rem]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-start py-2 pe-3 font-medium text-muted-foreground sticky start-0 bg-card z-10">
                            {t('portal.parameter')}
                          </th>
                          {comparison.reports.map(reportHeaderCell)}
                          <th className="text-center py-2 px-2 w-16">{t('portal.changePercent')}</th>
                          <th className="text-center py-2 ps-2 w-10">{t('portal.trend')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisDateRow(
                          <>
                            <td className="py-2.5" />
                            <td className="py-2.5" />
                          </>
                        )}
                        {numericParams.map((param) => (
                          <tr key={param.code} className="border-b border-border/60">
                            <td className="py-2.5 pe-3 sticky start-0 bg-card z-10">
                              <div className="font-medium">{isAr ? param.nameAr : param.nameEn}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {param.unit} · {param.reference}
                              </div>
                            </td>
                            {param.values.map((v) => (
                              <td key={v.reportId} className={`text-center py-2.5 px-2 font-mono ${flagClass(v.flag)}`}>
                                {v.value}
                              </td>
                            ))}
                            <td className="text-center py-2.5 font-mono text-xs">
                              {param.percentChange != null ? (
                                <span className={param.percentChange > 0 ? 'text-emerald-600' : param.percentChange < 0 ? 'text-blue-600' : ''}>
                                  {param.percentChange > 0 ? '+' : ''}{param.percentChange}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="text-center py-2.5">
                              <TrendIcon trend={param.trend} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {otherParams.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('portal.otherResults')}</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-sm border-collapse min-w-[28rem]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-start py-2 pe-3 font-medium text-muted-foreground">{t('portal.parameter')}</th>
                          {comparison.reports.map(reportHeaderCell)}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisDateRow()}
                        {otherParams.map((param) => (
                          <tr key={param.code} className="border-b border-border/60">
                            <td className="py-2.5 pe-3 font-medium">{isAr ? param.nameAr : param.nameEn}</td>
                            {param.values.map((v) => (
                              <td key={v.reportId} className={`text-center py-2.5 px-2 ${flagClass(v.flag)}`}>
                                {v.value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </PortalLayout>
  );
}
