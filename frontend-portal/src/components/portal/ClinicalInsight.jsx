import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export default function ClinicalInsight({ interpretation, isAr, compact = false }) {
  const { t } = useTranslation();
  const text = isAr ? interpretation?.ar : interpretation?.en;
  if (!text) return null;

  return (
    <div className={cn(
      'rounded-xl border border-[#C5A059]/25 bg-gradient-to-br from-white to-amber-50/40 shadow-sm',
      compact ? 'p-3' : 'p-4'
    )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={compact ? 14 : 16} className="text-[#C5A059]" />
        <h3 className={cn('font-semibold text-slate-800', compact ? 'text-xs' : 'text-sm')}>
          {t('portal.clinicalInterpretation')}
        </h3>
      </div>
      <p className={cn('leading-relaxed text-slate-600', compact ? 'text-[11px]' : 'text-sm')}>{text}</p>
    </div>
  );
}
