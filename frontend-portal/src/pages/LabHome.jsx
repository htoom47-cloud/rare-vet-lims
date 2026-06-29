import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Globe, LogIn, MessageCircle } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { useTheme } from '../context/ThemeContext';
import LabBrandLockup from '../components/portal/LabBrandLockup';
import LabBrochureViewer from '../components/portal/LabBrochureViewer';
import { Button } from '../components/ui/button';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../utils/whatsapp';

export default function LabHome() {
  const { t, i18n } = useTranslation();
  const { customer, loading } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    if (!loading && customer) navigate('/dashboard', { replace: true });
  }, [loading, customer, navigate]);

  return (
    <div className="min-h-screen bg-[#e8e4de] relative" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur-md shadow-sm">
        <div className="max-w-[52rem] mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-[11rem] sm:max-w-[13rem]" />
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={toggleLanguage}
              title={isAr ? 'English' : 'العربية'}
            >
              <Globe size={17} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 hidden sm:inline-flex"
              onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, isAr
                ? 'مرحباً، أرغب بالاستفسار عن خدمات المختبر'
                : 'Hello, I would like to inquire about your laboratory services')}
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline">{t('portal.whatsapp')}</span>
            </Button>
            <Button asChild size="sm" className="h-9 gap-1.5 shadow-sm">
              <Link to="/login">
                <LogIn size={16} />
                {t('home.portalLogin')}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="px-2 sm:px-4 py-4 sm:py-6 pb-28">
        <LabBrochureViewer />
      </main>

      <div className="fixed bottom-4 end-4 z-30 flex flex-col gap-2 sm:hidden">
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg bg-[#25D366] hover:bg-[#20bd5a] text-white"
          onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE)}
          aria-label={t('portal.whatsapp')}
        >
          <MessageCircle size={22} />
        </Button>
        <Button asChild size="icon" className="h-12 w-12 rounded-full shadow-lg">
          <Link to="/login" aria-label={t('home.portalLogin')}>
            <LogIn size={22} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
