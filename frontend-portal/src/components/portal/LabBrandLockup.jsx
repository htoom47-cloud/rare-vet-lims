import { useTranslation } from 'react-i18next';
import AppLogo from '../ui/AppLogo';
import { cn } from '../../lib/utils';

export default function LabBrandLockup({
  compact = false,
  embedded = false,
  stacked = false,
  noDivider = false,
  className = '',
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  if (stacked) {
    return (
      <div className={cn('portal-lab-brand portal-lab-brand--hero w-full', className)}>
        <AppLogo size="xl" variant="light" className="mx-auto" />
        <p className="portal-lab-brand-name mt-5 text-lg sm:text-xl font-bold text-foreground leading-snug">
          {t('portal.labName')}
        </p>
        <p className="portal-lab-brand-tag mt-1.5 text-xs sm:text-sm text-primary-500 dark:text-primary-400 font-medium max-w-[18rem] mx-auto leading-relaxed">
          {t('portal.labTagline')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'portal-lab-brand w-full',
        embedded ? 'portal-lab-brand--embedded' : '',
        noDivider ? 'portal-lab-brand--no-divider' : '',
        compact ? 'px-2.5 py-2' : 'px-3.5 py-3',
        className
      )}
    >
      <div className="flex items-center gap-2.5 w-full">
        <AppLogo
          size={compact ? 'xs' : 'sm'}
          variant="brand"
          className={cn('shrink-0', embedded && 'portal-logo-mark--brand')}
        />
        <div className={cn('min-w-0 flex-1 leading-tight', isAr ? 'text-end' : 'text-start')}>
          <p
            className={cn(
              'portal-lab-brand-name font-bold text-primary-800',
              compact ? 'text-[11px] sm:text-xs' : 'text-[13px] sm:text-sm'
            )}
          >
            {t('portal.labName')}
          </p>
          <p
            className={cn(
              'portal-lab-brand-tag text-primary-500 font-medium',
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
