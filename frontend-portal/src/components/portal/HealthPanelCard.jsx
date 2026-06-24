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

const STATUS_PANEL = {
  normal: 'med-panel-card--normal',
  attention: 'med-panel-card--attention',
  abnormal: 'med-panel-card--abnormal',
  none: 'med-panel-card--none',
};

const STATUS_BG = {
  normal: 'bg-[#ECFDF5] text-[#10B981]',
  attention: 'bg-[#FFFBEB] text-[#F59E0B]',
  abnormal: 'bg-[#FEF2F2] text-[#EF4444]',
  none: 'bg-[#F3F4F6] text-[#6B7280]',
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
        'med-panel-card w-full text-start rounded-xl bg-white transition-all duration-200',
        STATUS_PANEL[status],
        onClick && 'cursor-pointer',
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
          'shrink-0 rounded-xl flex items-center justify-center',
          compact ? 'w-8 h-8' : 'w-9 h-9',
          STATUS_BG[status],
          status !== 'none' && 'shadow-[0_0_12px_rgba(0,0,0,0.06)]'
        )}
        >
          <Icon size={compact ? 15 : 17} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="font-semibold text-[13px] text-[#111827] leading-tight">
              {t(`portal.panels.${panel.key}`)}
            </p>
            <StatusDot status={status} />
          </div>
          {total > 0 ? (
            <div className="flex items-baseline gap-2 mt-1">
              {abnormal > 0 && (
                <span className="text-lg font-bold text-[#EF4444] leading-none tabular-nums">{abnormal}</span>
              )}
              {attention > 0 && abnormal === 0 && (
                <span className="text-lg font-bold text-[#F59E0B] leading-none tabular-nums">{attention}</span>
              )}
              {status === 'normal' && (
                <span className="text-lg font-bold text-[#10B981] leading-none">✓</span>
              )}
              <span className="text-[11px] text-[#6B7280]">
                {status === 'abnormal'
                  ? t('portal.outOfRangeShort')
                  : status === 'attention'
                    ? t('portal.followUpShort')
                    : t('portal.normalShort')}
                {total > 0 && ` · ${total} ${isAr ? 'فحص' : 'tests'}`}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-[#9CA3AF] mt-1">{t('portal.panelNotTested')}</p>
          )}
          <p className="text-[11px] text-[#6B7280] mt-1 line-clamp-2 leading-snug">{summary()}</p>
        </div>
      </div>
    </div>
  );
}
