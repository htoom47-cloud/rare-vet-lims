import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

const STATUS_STYLES = {
  normal: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  attention: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  abnormal: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
  none: 'bg-muted text-muted-foreground border-border',
};

const DOT_STYLES = {
  normal: 'bg-emerald-500',
  attention: 'bg-amber-500',
  abnormal: 'bg-rose-500',
  none: 'bg-muted-foreground/40',
};

export function StatusDot({ status, className }) {
  return (
    <span
      className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', DOT_STYLES[status] || DOT_STYLES.none, className)}
      aria-hidden
    />
  );
}

export default function StatusBadge({ status, className }) {
  const { t } = useTranslation();
  const label = t(`portal.healthStatus.${status}`, status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        STATUS_STYLES[status] || STATUS_STYLES.none,
        className
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
