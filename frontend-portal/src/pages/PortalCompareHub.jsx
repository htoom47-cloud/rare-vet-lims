import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GitCompare, PawPrint } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { portalAnimalsAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

export default function PortalCompareHub() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    portalAnimalsAPI.list()
      .then(({ data }) => setAnimals(data.data.filter((a) => a.report_count >= 2)))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <PortalLayout title={t('portal.navCompare')} subtitle={t('portal.compareHint')} wide>
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && animals.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('portal.noCompare')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {animals.map((animal) => (
          <Card key={animal.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <PawPrint size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold font-mono">{animal.animal_code}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {animalLabel(animal.animal_type, isAr)}
                    {animal.name_tag ? ` · ${animal.name_tag}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('portal.reportCount', { count: animal.report_count })}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => navigate(`/animals/${animal.id}/compare`)}>
                {t('portal.compare')}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PortalLayout>
  );
}
