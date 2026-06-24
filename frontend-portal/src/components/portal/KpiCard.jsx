import { cn } from '../../lib/utils';

const ACCENTS = {
  default: 'bg-white border-slate-200/80 text-slate-900',
  primary: 'bg-white border-slate-200/80',
  success: 'bg-white border-emerald-200/80',
  warning: 'bg-white border-amber-200/80',
  danger: 'bg-white border-rose-200/80',
  info: 'bg-white border-sky-200/80',
};

const ICON_ACCENTS = {
  default: 'bg-slate-100 text-slate-600',
  primary: 'bg-[#302419]/10 text-[#302419]',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
  info: 'bg-sky-50 text-sky-600',
};

const VALUE_ACCENTS = {
  default: 'text-slate-900',
  primary: 'text-[#302419]',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
  info: 'text-sky-600',
};

export default function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'default',
  compact = false,
  className,
}) {
  return (
    <div
      className={cn(
        'med-kpi-card rounded-xl border shadow-sm',
        ACCENTS[accent] || ACCENTS.default,
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">
            {label}
          </p>
          <p className={cn(
            'font-bold tabular-nums leading-none mt-1.5',
            compact ? 'text-xl' : 'text-2xl',
            VALUE_ACCENTS[accent] || VALUE_ACCENTS.default
          )}
          >
            {value}
          </p>
          {hint && (
            <p className="text-[11px] text-slate-500 mt-1 truncate">{hint}</p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            'shrink-0 rounded-lg flex items-center justify-center',
            compact ? 'w-8 h-8' : 'w-10 h-10',
            ICON_ACCENTS[accent] || ICON_ACCENTS.default
          )}
          >
            <Icon size={compact ? 16 : 18} />
          </div>
        )}
      </div>
    </div>
  );
}
