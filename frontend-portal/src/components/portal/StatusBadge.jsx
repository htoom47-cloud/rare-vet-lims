import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

const STATUS_STYLES = {
  normal: 'bg-[#ECFDF5] text-[#047857] border-[#10B981]',
  attention: 'bg-[#FFFBEB] text-[#B45309] border-[#F59E0B]',
  abnormal: 'bg-[#FEF2F2] text-[#B91C1C] border-[#EF4444]',
  none: 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]',
};

const DOT_STYLES = {
  normal: 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.6)]',
  attention: 'bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.6)]',
  abnormal: 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.6)]',
  none: 'bg-[#9CA3AF]',
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
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
        STATUS_STYLES[status] || STATUS_STYLES.none,
        className
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
