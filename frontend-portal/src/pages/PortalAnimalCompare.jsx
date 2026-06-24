import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus, ArrowLeft, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { portalAnimalsAPI, portalReportsAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

const flagClass = (flag) => {
  if (flag === 'H' || flag === 'POS') return 'text-red-600 font-semibold';
  if (flag === 'L' || flag === 'NEG') return 'text-blue-600 font-semibold';
  return '';
};

const TrendIcon = ({ trend }) => {
  if (trend === 'up') return <ArrowUp size={14} className="text-amber-600" />;
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

  const toggleReport = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
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

  const title = comparison?.animal?.code || reports[0]?.animal_code || t('portal.navCompare');
  const subtitle = comparison?.animal
    ? `${animalLabel(comparison.animal.type, isAr)}${comparison.animal.name ? ` · ${comparison.animal.name}` : ''}`
    : '';

  const numericParams = useMemo(
    () => (comparison?.parameters || []).filter((p) => p.comparable),
    [comparison]
  );
  const otherParams = useMemo(
    () => (comparison?.parameters || []).filter((p) => !p.comparable),
    [comparison]
  );

  return (
    <PortalLayout title={title} subtitle={subtitle}>
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
              {numericParams.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('portal.numericCompare')}</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-sm border-collapse min-w-[32rem]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-start py-2 pe-3 font-medium text-muted-foreground sticky start-0 bg-card z-10">
                            {t('portal.parameter')}
                          </th>
                          {comparison.reports.map((r) => (
                            <th key={r.id} className="text-center py-2 px-2 font-medium min-w-[5.5rem]">
                              <div className="font-mono text-xs">{r.reportNumber}</div>
                              <div className="text-[10px] text-muted-foreground font-normal">{formatDate(r.date)}</div>
                            </th>
                          ))}
                          <th className="text-center py-2 ps-2 w-10">{t('portal.trend')}</th>
                        </tr>
                      </thead>
                      <tbody>
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
                          {comparison.reports.map((r) => (
                            <th key={r.id} className="text-center py-2 px-2 font-medium text-xs font-mono">
                              {r.reportNumber}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
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
