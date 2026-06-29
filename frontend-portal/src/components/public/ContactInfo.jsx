import { Phone, Mail, MapPin, Clock, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../../utils/whatsapp';

const LAB_PHONE = '0115007257';
const LAB_EMAIL = 'alnwader.10hz@gmail.com';

function InfoField({ icon: Icon, label, value, href, dir }) {
  const inner = (
    <>
      <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-primary-700 dark:text-primary-300" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-foreground font-medium mt-0.5 break-words">{value}</p>
      </div>
    </>
  );
  const cls = 'flex items-start gap-3 p-4 rounded-xl border border-border/70 bg-card/80 hover:border-primary-300/60 transition-colors site-card !transform-none';
  if (href) return <a href={href} className={cls} dir={dir}>{inner}</a>;
  return <div className={cls}>{inner}</div>;
}

export default function ContactInfo() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  return (
    <div className="grid sm:grid-cols-2 gap-3 content-start">
      <InfoField icon={Phone} label={t('home.phone')} value={LAB_PHONE} href={`tel:${LAB_PHONE}`} dir="ltr" />
      <InfoField icon={Mail} label={t('home.email')} value={LAB_EMAIL} href={`mailto:${LAB_EMAIL}`} />
      <InfoField icon={MapPin} label={t('home.location')} value={t('home.address')} />
      <InfoField icon={Clock} label={t('home.workingHours')} value={t('home.hoursValue')} />
      <div className="sm:col-span-2">
        <Button
          type="button"
          className="w-full gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 h-11"
          onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, isAr ? 'مرحباً، أرغب بالتواصل مع المختبر' : 'Hello, I would like to contact the laboratory')}
        >
          <MessageCircle size={18} />
          {t('portal.contactWhatsApp')}
          <span className="font-mono text-sm opacity-90" dir="ltr">{LAB_WHATSAPP_PHONE}</span>
        </Button>
      </div>
    </div>
  );
}
