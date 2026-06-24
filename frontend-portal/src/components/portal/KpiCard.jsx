import { cn } from '../../lib/utils';

const VARIANT = {
  blue: {
    card: 'med-kpi-card--blue',
    icon: 'med-kpi-icon-glow--blue',
    value: 'text-primary-600 dark:text-primary-400',
  },
  purple: {
    card: 'med-kpi-card--purple',
    icon: 'med-kpi-icon-glow--purple',
    value: 'text-primary-500 dark:text-primary-300',
  },
  green: {
    card: 'med-kpi-card--green',
    icon: 'med-kpi-icon-glow--green',
    value: 'text-[#10B981]',
  },
  orange: {
    card: 'med-kpi-card--orange',
    icon: 'med-kpi-icon-glow--orange',
    value: 'text-[#F59E0B]',
  },
  red: {
    card: 'med-kpi-card--red',
    icon: 'med-kpi-icon-glow--red',
    value: 'text-[#EF4444]',
  },
  neutral: {
    card: 'med-kpi-card--neutral',
    icon: 'med-kpi-icon-glow--neutral',
    value: 'text-foreground',
  },
};

/** @deprecated use blue|purple|green|orange|red|neutral */
const LEGACY_MAP = {
  primary: 'blue',
  info: 'blue',
  success: 'green',
  warning: 'orange',
  danger: 'red',
  default: 'neutral',
};

export default function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'neutral',
  compact = false,
  className,
}) {
  const variantKey = VARIANT[accent] ? accent : (LEGACY_MAP[accent] || 'neutral');
  const v = VARIANT[variantKey];

  return (
    <div
      className={cn(
        'med-kpi-card rounded-xl',
        v.card,
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
            {label}
          </p>
          <p className={cn(
            'font-bold tabular-nums leading-none mt-1.5',
            compact ? 'text-xl' : 'text-2xl',
            v.value
          )}
          >
            {value}
          </p>
          {hint && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            'shrink-0 rounded-xl flex items-center justify-center',
            compact ? 'w-9 h-9' : 'w-10 h-10',
            v.icon
          )}
          >
            <Icon size={compact ? 17 : 19} strokeWidth={2.25} />
          </div>
        )}
      </div>
    </div>
  );
}
