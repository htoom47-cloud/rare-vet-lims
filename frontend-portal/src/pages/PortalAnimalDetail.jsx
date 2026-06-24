import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GitCompare, FolderOpen, ArrowLeft, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import AnimalProfileCard from '../components/portal/AnimalProfileCard';
import HealthPanelCard from '../components/portal/HealthPanelCard';
import ClinicalInsight from '../components/portal/ClinicalInsight';
import ParameterChangeRow from '../components/portal/ParameterChangeRow';
import TrendChart from '../components/portal/TrendChart';
import ReportListCard from '../components/portal/ReportListCard';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { portalAnimalsAPI } from '../services/portalApi';

export default function PortalAnimalDetail() {
  const { animalId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [trendData, setTrendData] = useState(null);
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

  const title = dashboard?.animal?.code || t('portal.myAnimals');

  return (
    <PortalLayout title={title} subtitle={t('portal.animalDashboard')} wide>
      <Button variant="ghost" size="sm" className="mb-4 gap-1 -ms-2" onClick={() => navigate('/animals')}>
        <BackIcon size={16} /> {t('labReport.back')}
      </Button>

      {loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && dashboard && (
        <div className="space-y-6">
          <AnimalProfileCard
            animal={dashboard.animal}
            owner={dashboard.owner}
            reportCount={dashboard.reportCount}
            latestReport={dashboard.latestReport}
            isAr={isAr}
          />

          <div className="flex flex-wrap gap-2">
            {dashboard.canCompare && (
              <Button className="gap-2" onClick={() => navigate(`/animals/${animalId}/compare`)}>
                <GitCompare size={16} />
                {t('portal.compareReports')}
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => navigate(`/documents?animalId=${animalId}`)}>
              <FolderOpen size={16} />
              {t('portal.documents')}
            </Button>
          </div>

          <section>
            <h2 className="text-lg font-semibold mb-3">{t('portal.healthSummary')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(dashboard.panels || []).map((panel) => (
                <HealthPanelCard key={panel.key} panel={panel} />
              ))}
            </div>
          </section>

          {dashboard.interpretation && (
            <ClinicalInsight interpretation={dashboard.interpretation} isAr={isAr} />
          )}

          {dashboard.keyParameters?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('portal.historicalComparison')}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border/50">
                {dashboard.keyParameters.map((param) => (
                  <ParameterChangeRow key={param.code} param={param} isAr={isAr} />
                ))}
              </CardContent>
            </Card>
          )}

          {(dashboard.trendCandidates?.length > 0) && (
            <section>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">{t('portal.trendChart')}</h2>
                <select
                  className="input-field text-sm h-9 w-auto max-w-[14rem]"
                  value={selectedParam || ''}
                  onChange={(e) => setSelectedParam(e.target.value)}
                >
                  {dashboard.trendCandidates.map((code) => {
                    const p = dashboard.keyParameters?.find((x) => x.code === code);
                    const label = p
                      ? (isAr ? p.nameAr : p.nameEn)
                      : code;
                    return <option key={code} value={code}>{label || code}</option>;
                  })}
                </select>
              </div>
              <TrendChart data={trendData} meta={trendData?.meta} isAr={isAr} />
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-3">{t('portal.reportHistory')}</h2>
            <div className="space-y-3">
              {(dashboard.recentReports || []).map((report) => (
                <ReportListCard
                  key={report.id}
                  report={{
                    ...report,
                    animal_code: dashboard.animal.code,
                    animal_name: dashboard.animal.name,
                    animal_type: dashboard.animal.type,
                    created_at: report.created_at,
                    report_number: report.report_number,
                  }}
                  isAr={isAr}
                  showAnimal={false}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </PortalLayout>
  );
}
