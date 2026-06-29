import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GitCompare, ChevronLeft, ChevronRight } from 'lucide-react';
import AnimalsNavIcon from '../components/portal/AnimalsNavIcon';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { portalAnimalsAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

export default function PortalAnimals() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';
  const Chevron = isAr ? ChevronLeft : ChevronRight;

  useEffect(() => {
    portalAnimalsAPI.list()
      .then(({ data }) => setAnimals(data.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  return (
    <PortalLayout title={t('portal.myAnimals')} subtitle={t('portal.animalsHint')} wide>
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && animals.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AnimalsNavIcon size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('portal.noAnimals')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {animals.map((animal) => (
          <Card key={animal.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex-1 text-start min-w-0"
                  onClick={() => navigate(`/animals/${animal.id}`)}
                >
                  <p className="text-lg font-bold text-foreground leading-tight truncate">
                    {animal.name_tag || animalLabel(animal.animal_type, isAr)}
                  </p>
                  {animal.name_tag && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {animalLabel(animal.animal_type, isAr)}
                    </p>
                  )}
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {animal.animal_code}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('portal.reportCount', { count: animal.report_count })}
                    {animal.latest_report_at ? ` · ${formatDate(animal.latest_report_at)}` : ''}
                  </p>
                </button>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/animals/${animal.id}`)}>
                    <Chevron size={16} />
                  </Button>
                  {animal.report_count >= 2 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1"
                      onClick={() => navigate(`/animals/${animal.id}/compare`)}
                    >
                      <GitCompare size={14} />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PortalLayout>
  );
}
