import { useTranslation } from 'react-i18next';
import AppLogo from '../ui/AppLogo';
import { cn } from '../../lib/utils';

export default function LabBrandLockup({ compact = false, embedded = false, className = '' }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  return (
    <div
      className={cn(
        'portal-lab-brand w-full',
        embedded ? 'portal-lab-brand--embedded' : '',
        compact ? 'px-2.5 py-2' : 'px-3.5 py-3',
        className
      )}
    >
      <div className="flex items-center gap-2.5 w-full">
        <AppLogo size={compact ? 'xs' : 'sm'} variant="brand" className="shrink-0" />
        <div className={cn('min-w-0 flex-1 leading-tight', isAr ? 'text-end' : 'text-start')}>
          <p
            className={cn(
              'portal-lab-brand-name font-bold text-primary-800',
              embedded && 'dark:text-primary-50',
              compact ? 'text-[11px] sm:text-xs' : 'text-[13px] sm:text-sm'
            )}
          >
            {t('portal.labName')}
          </p>
          <p
            className={cn(
              'portal-lab-brand-tag text-primary-400 font-medium',
              embedded && 'dark:text-primary-300',
              compact ? 'text-[9px] sm:text-[10px] mt-0.5' : 'text-[10px] sm:text-[11px] mt-0.5'
            )}
          >
            {t('portal.labTagline')}
          </p>
        </div>
      </div>
    </div>
  );
}
