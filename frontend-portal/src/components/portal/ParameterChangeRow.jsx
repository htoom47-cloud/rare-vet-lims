import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { StatusDot } from './StatusBadge';

const flagStatus = (flag) => {
  if (!flag || ['NORMAL', 'NEG', 'PENDING'].includes(flag)) return 'normal';
  if (String(flag).startsWith('CRIT') || ['H', 'L', 'POS'].includes(flag)) return 'abnormal';
  return 'attention';
};

export default function ParameterChangeRow({ param, isAr }) {
  const name = isAr ? (param.nameAr || param.nameEn) : (param.nameEn || param.nameAr);
  const status = flagStatus(param.latestFlag);
  const change = param.percentChange;
  const hasChange = change != null && param.previous != null;

  return (
    <div className="portal-param-row flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <StatusDot status={status} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {param.unit && <span>{param.unit} · </span>}
          {param.reference || '—'}
        </p>
      </div>
      <div className="text-end shrink-0">
        <p className="font-mono font-semibold text-base">{param.current ?? '—'}</p>
        {hasChange && (
          <p className="text-[11px] text-muted-foreground">
            {isAr ? 'السابقة' : 'Prev'}: {param.previous}
          </p>
        )}
      </div>
      {hasChange && (
        <div
          className={cn(
            'flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg shrink-0',
            change > 0 && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            change < 0 && 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
            change === 0 && 'bg-muted text-muted-foreground'
          )}
        >
          {change > 0 ? <ArrowUp size={12} /> : change < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
          {change > 0 ? '+' : ''}{change}%
        </div>
      )}
    </div>
  );
}
