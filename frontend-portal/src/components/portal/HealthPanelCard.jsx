import {
  Activity, Beaker, Bug, Dna, FlaskConical, HeartPulse, Baby,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusDot } from './StatusBadge';
import { cn } from '../../lib/utils';

const PANEL_ICONS = {
  cbc: Activity,
  chem: FlaskConical,
  hormones: Beaker,
  infectious: Dna,
  parasitology: Bug,
  reproduction: Baby,
};

const STATUS_BORDER = {
  normal: 'border-emerald-200/80 ring-emerald-500/10',
  attention: 'border-amber-200/80 ring-amber-500/10',
  abnormal: 'border-rose-200/80 ring-rose-500/15',
  none: 'border-slate-200/80',
};

const STATUS_BG = {
  normal: 'bg-emerald-50',
  attention: 'bg-amber-50',
  abnormal: 'bg-rose-50',
  none: 'bg-slate-50',
};

const STATUS_TEXT = {
  normal: 'text-emerald-700',
  attention: 'text-amber-700',
  abnormal: 'text-rose-700',
  none: 'text-slate-500',
};

export default function HealthPanelCard({ panel, onClick, compact = false, className }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const Icon = PANEL_ICONS[panel.key] || HeartPulse;
  const status = panel.status || 'none';
  const total = panel.total || 0;
  const abnormal = panel.abnormal || 0;
  const attention = panel.attention || 0;

  const summary = () => {
    if (status === 'none') return t('portal.panelNotTested');
    if (status === 'normal') return t('portal.panelAllNormal', { count: total });
    if (abnormal > 0) return t('portal.panelAbnormalSummary', { count: abnormal, total });
    if (attention > 0) return t('portal.panelAttentionSummary', { count: attention, total });
    return t('portal.panelAllNormal', { count: total });
  };

  return (
    <div
      className={cn(
        'med-panel-card w-full text-start rounded-xl border bg-white shadow-sm ring-1 ring-inset transition-all',
        STATUS_BORDER[status],
        onClick && 'hover:shadow-md hover:-translate-y-px cursor-pointer',
        compact ? 'p-3' : 'p-3.5',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn(
          'shrink-0 rounded-lg flex items-center justify-center',
          compact ? 'w-8 h-8' : 'w-9 h-9',
          STATUS_BG[status],
          STATUS_TEXT[status]
        )}
        >
          <Icon size={compact ? 15 : 17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="font-semibold text-[13px] text-slate-800 leading-tight">
              {t(`portal.panels.${panel.key}`)}
            </p>
            <StatusDot status={status} />
          </div>
          {total > 0 ? (
            <div className="flex items-baseline gap-2 mt-1">
              {abnormal > 0 && (
                <span className="text-lg font-bold text-rose-600 leading-none tabular-nums">{abnormal}</span>
              )}
              {attention > 0 && abnormal === 0 && (
                <span className="text-lg font-bold text-amber-600 leading-none tabular-nums">{attention}</span>
              )}
              {status === 'normal' && (
                <span className="text-lg font-bold text-emerald-600 leading-none">✓</span>
              )}
              <span className="text-[11px] text-slate-500">
                {status === 'abnormal'
                  ? t('portal.outOfRangeShort')
                  : status === 'attention'
                    ? t('portal.followUpShort')
                    : t('portal.normalShort')}
                {total > 0 && ` · ${total} ${isAr ? 'فحص' : 'tests'}`}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">{t('portal.panelNotTested')}</p>
          )}
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-snug">{summary()}</p>
        </div>
      </div>
    </div>
  );
}
