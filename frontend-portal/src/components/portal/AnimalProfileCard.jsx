import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import { animalLabel, genderLabel } from '../../utils/animalTypes';

export default function AnimalProfileCard({ animal, owner, reportCount, latestReport, isAr }) {
  const { t } = useTranslation();

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const fields = [
    { label: t('portal.animalName'), value: animal?.name || '—' },
    { label: t('portal.chipTag'), value: animal?.chip || animal?.code || '—' },
    { label: t('animals.type'), value: animalLabel(animal?.type, isAr) },
    { label: t('portal.gender'), value: genderLabel(animal?.gender, isAr) },
    { label: t('portal.age'), value: animal?.age || '—' },
    { label: t('portal.owner'), value: isAr ? (owner?.nameAr || owner?.name) : owner?.name },
    { label: t('portal.lastVisit'), value: formatDate(latestReport?.createdAt) },
    { label: t('portal.testsCount'), value: reportCount ?? '—' },
  ];

  return (
    <Card className="portal-profile-card overflow-hidden">
      <div className="portal-profile-banner h-2" />
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              {t('portal.animalDashboard')}
            </p>
            <h2 className="text-2xl font-bold mt-1 font-mono">{animal?.code}</h2>
            {animal?.name && (
              <p className="text-muted-foreground mt-0.5">{animal.name}</p>
            )}
          </div>
          {owner?.farm && (
            <span className="portal-farm-badge text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium">
              {owner.farm}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {fields.map(({ label, value }) => (
            <div key={label} className="portal-profile-field">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-medium text-sm mt-0.5 truncate" title={String(value)}>{value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
