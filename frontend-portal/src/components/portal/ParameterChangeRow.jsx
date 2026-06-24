import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { StatusDot } from './StatusBadge';

const flagStatus = (flag) => {
  if (!flag || ['NORMAL', 'NEG', 'PENDING'].includes(flag)) return 'normal';
  if (String(flag).startsWith('CRIT') || ['H', 'L', 'POS'].includes(flag)) return 'abnormal';
  return 'attention';
};

export default function ParameterChangeRow({ param, isAr, compact = false }) {
  const name = isAr ? (param.nameAr || param.nameEn) : (param.nameEn || param.nameAr);
  const status = flagStatus(param.latestFlag);
  const change = param.percentChange;
  const hasChange = change != null && param.previous != null;

  return (
    <div className={cn('flex items-center gap-2', compact ? 'py-2' : 'py-3')}>
      <StatusDot status={status} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium truncate text-slate-800', compact ? 'text-xs' : 'text-sm')}>{name}</p>
        {!compact && (
          <p className="text-xs text-slate-400 mt-0.5">
            {param.unit && <span>{param.unit} · </span>}
            {param.reference || '—'}
          </p>
        )}
      </div>
      <div className="text-end shrink-0">
        <p className={cn('font-mono font-semibold text-slate-900', compact ? 'text-sm' : 'text-base')}>
          {param.current ?? '—'}
        </p>
      </div>
      {hasChange && (
        <div
          className={cn(
            'flex items-center gap-0.5 font-semibold rounded-md shrink-0',
            compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
            change > 0 && 'bg-emerald-50 text-emerald-700',
            change < 0 && 'bg-sky-50 text-sky-700',
            change === 0 && 'bg-slate-100 text-slate-500'
          )}
        >
          {change > 0 ? <ArrowUp size={10} /> : change < 0 ? <ArrowDown size={10} /> : <Minus size={10} />}
          {change > 0 ? '+' : ''}{change}%
        </div>
      )}
    </div>
  );
}
