import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export default function ClinicalInsight({ interpretation, isAr, compact = false }) {
  const { t } = useTranslation();
  const text = isAr ? interpretation?.ar : interpretation?.en;
  if (!text) return null;

  return (
    <div className={cn(
      'portal-insight-card rounded-xl',
      compact ? 'p-3' : 'p-4'
    )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={compact ? 14 : 16} className="text-[#8B5CF6] drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
        <h3 className={cn('font-semibold text-[#111827]', compact ? 'text-xs' : 'text-sm')}>
          {t('portal.clinicalInterpretation')}
        </h3>
      </div>
      <p className={cn('leading-relaxed text-[#6B7280]', compact ? 'text-[11px]' : 'text-sm')}>{text}</p>
    </div>
  );
}
