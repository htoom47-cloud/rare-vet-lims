import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../../utils/whatsapp';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export default function WhatsAppContact({ variant = 'float', className }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const message = isAr
    ? 'مرحباً، أتواصل معكم من بوابة العميل — مركز رعاية النوادر البيطري'
    : 'Hello, I am contacting you from the client portal — Rare Veterinary Care Center';

  const handleClick = () => openWhatsApp(LAB_WHATSAPP_PHONE, message);

  if (variant === 'sidebar') {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(
          'w-full justify-start gap-3 text-green-700 hover:text-green-800 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/25',
          className,
        )}
        onClick={handleClick}
      >
        <MessageCircle size={18} />
        <span className="flex flex-col items-start leading-tight">
          <span>{t('portal.whatsapp')}</span>
          <span className="text-xs font-mono opacity-80" dir="ltr">{LAB_WHATSAPP_PHONE}</span>
        </span>
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t('portal.contactWhatsApp')}
      aria-label={t('portal.contactWhatsApp')}
      className={cn(
        'fixed z-30 flex items-center gap-2 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95',
        'bg-[#25D366] text-white px-4 py-3 font-medium text-sm',
        'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] end-4 lg:bottom-6',
        className,
      )}
    >
      <MessageCircle size={22} strokeWidth={2.25} />
      <span className="hidden sm:inline">{t('portal.whatsapp')}</span>
    </button>
  );
}
