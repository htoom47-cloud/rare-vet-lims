import { GitCompare, FolderOpen, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { animalLabel, genderLabel } from '../../utils/animalTypes';
import AnimalTypeIcon from './AnimalTypeIcon';
import StatusBadge from './StatusBadge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const STATUS_RING = {
  normal: 'border-[#10B981] bg-[#ECFDF5] text-[#10B981] shadow-[0_0_16px_rgba(16,185,129,0.35)]',
  attention: 'border-[#F59E0B] bg-[#FFFBEB] text-[#F59E0B] shadow-[0_0_16px_rgba(245,158,11,0.35)]',
  abnormal: 'border-[#EF4444] bg-[#FEF2F2] text-[#EF4444] shadow-[0_0_16px_rgba(239,68,68,0.35)]',
  unknown: 'border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]',
};

export default function AnimalHeroHeader({
  animal,
  owner,
  latestReport,
  kpis,
  animalId,
  canCompare,
  isAr,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = kpis?.overallStatus || 'unknown';
  const displayName = animal?.name || animal?.code;
  const showCodeSeparately = Boolean(animal?.name && animal?.code);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const meta = [
    animalLabel(animal?.type, isAr),
    genderLabel(animal?.gender, isAr),
    showCodeSeparately ? animal.code : null,
    animal?.chip && animal.chip !== animal?.code ? animal.chip : null,
  ].filter((x) => x && x !== '—').join(' · ');

  return (
    <div className="med-hero premium-card p-3 sm:p-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            'shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center',
            STATUS_RING[status] || STATUS_RING.unknown
          )}
          >
            <AnimalTypeIcon type={animal?.type} size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight truncate">
                {displayName}
              </h1>
              {showCodeSeparately && (
                <span className="text-xs sm:text-sm font-mono font-medium text-muted-foreground tracking-tight shrink-0">
                  {animal.code}
                </span>
              )}
              <StatusBadge status={status === 'unknown' ? 'none' : status} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">{meta}</p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
              {isAr ? (owner?.nameAr || owner?.name) : owner?.name}
              {owner?.farm ? ` · ${owner.farm}` : ''}
              {latestReport ? ` · ${t('portal.lastVisit')}: ${formatDate(latestReport.createdAt)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {latestReport && (
            <Button size="sm" className="h-8 gap-1.5 text-xs portal-btn-primary" onClick={() => navigate(`/reports/${latestReport.id}`)}>
              <FileText size={14} />
              {latestReport.reportNumber}
            </Button>
          )}
          {canCompare && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => navigate(`/animals/${animalId}/compare`)}>
              <GitCompare size={14} />
              {t('portal.compare')}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => navigate(`/documents?animalId=${animalId}`)}>
            <FolderOpen size={14} />
            {t('portal.documents')}
          </Button>
        </div>
      </div>
    </div>
  );
}
