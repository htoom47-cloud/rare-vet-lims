import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Globe, LogIn, MessageCircle } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { useTheme } from '../context/ThemeContext';
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

  const whatsappMsg = isAr
    ? 'مرحباً، أرغب بالاستفسار عن خدمات المختبر'
    : 'Hello, I would like to inquire about your laboratory services';

  return (
    <div className="min-h-screen bg-[#e8e4de] relative" dir={isAr ? 'rtl' : 'ltr'}>
      {/* شريط عائم فقط — بدون شعار حتى لا يتكرر مع غلاف الـ PDF */}
      <div
        className="fixed top-3 end-3 z-50 flex flex-wrap items-center justify-end gap-1.5 max-w-[calc(100%-1.5rem)]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-0.5 rounded-full bg-card/95 backdrop-blur-md border border-border/70 shadow-lg p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={toggleLanguage}
            title={isAr ? 'English' : 'العربية'}
          >
            <Globe size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>

        <Button
          type="button"
          size="sm"
          className="h-9 rounded-full gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 shadow-lg px-3"
          onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, whatsappMsg)}
        >
          <MessageCircle size={16} />
          <span className="text-xs sm:text-sm">{t('portal.whatsapp')}</span>
        </Button>

        <Button asChild size="sm" className="h-9 rounded-full gap-1.5 shadow-lg px-3">
          <Link to="/login">
            <LogIn size={16} />
            <span className="text-xs sm:text-sm">{t('home.portalLogin')}</span>
          </Link>
        </Button>
      </div>

      <main className="px-1 sm:px-4 py-2 sm:py-4">
        <LabBrochureViewer />
      </main>
    </div>
  );
}
