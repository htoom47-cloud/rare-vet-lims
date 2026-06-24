import { PawPrint, GitCompare, FolderOpen, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { animalLabel, genderLabel } from '../../utils/animalTypes';
import StatusBadge from './StatusBadge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const STATUS_RING = {
  normal: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  attention: 'border-amber-500 bg-amber-50 text-amber-700',
  abnormal: 'border-rose-500 bg-rose-50 text-rose-700',
  unknown: 'border-slate-300 bg-slate-50 text-slate-500',
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

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const meta = [
    animalLabel(animal?.type, isAr),
    genderLabel(animal?.gender, isAr),
    animal?.age,
    animal?.chip || animal?.code,
  ].filter((x) => x && x !== '—').join(' · ');

  return (
    <div className="med-hero rounded-xl border border-slate-200/80 bg-white shadow-sm p-3 sm:p-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            'shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center',
            STATUS_RING[status] || STATUS_RING.unknown
          )}
          >
            <PawPrint size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold font-mono text-slate-900">{animal?.code}</h1>
              {animal?.name && (
                <span className="text-sm text-slate-600 truncate">{animal.name}</span>
              )}
              <StatusBadge status={status === 'unknown' ? 'none' : status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{meta}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {isAr ? (owner?.nameAr || owner?.name) : owner?.name}
              {owner?.farm ? ` · ${owner.farm}` : ''}
              {latestReport ? ` · ${t('portal.lastVisit')}: ${formatDate(latestReport.createdAt)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {latestReport && (
            <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs" onClick={() => navigate(`/reports/${latestReport.id}`)}>
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
