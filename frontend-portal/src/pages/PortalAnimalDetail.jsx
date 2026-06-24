import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GitCompare } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import ReportListCard from '../components/portal/ReportListCard';
import { Button } from '../components/ui/button';
import { portalReportsAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

export default function PortalAnimalDetail() {
  const { animalId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    portalReportsAPI.list({ animalId, limit: 100 })
      .then(({ data }) => setReports(data.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [animalId, t]);

  const animal = reports[0];
  const title = animal?.animal_code || t('portal.myAnimals');
  const subtitle = animal
    ? `${animalLabel(animal.animal_type, isAr)}${animal.animal_name ? ` · ${animal.animal_name}` : ''}`
    : '';

  return (
    <PortalLayout title={title} subtitle={subtitle}>
      {reports.length >= 2 && (
        <Button
          className="mb-4 gap-2"
          onClick={() => navigate(`/animals/${animalId}/compare`)}
        >
          <GitCompare size={16} />
          {t('portal.compareReports')}
        </Button>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      <div className="space-y-4">
        {!loading && reports.map((report) => (
          <ReportListCard key={report.id} report={report} isAr={isAr} showAnimal={false} />
        ))}
      </div>
    </PortalLayout>
  );
}
