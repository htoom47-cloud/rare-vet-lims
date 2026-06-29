import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sun, Moon, Globe, FlaskConical, Microscope, HeartPulse, ShieldCheck,
  LogIn, Phone, Mail, MapPin, MessageCircle,
} from 'lucide-react';
import { m } from 'framer-motion';
import { usePortal } from '../context/PortalContext';
import { useTheme } from '../context/ThemeContext';
import LabBrandLockup from '../components/portal/LabBrandLockup';
import WhatsAppContact from '../components/portal/WhatsAppContact';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { FadeIn } from '../components/motion/AnimatedPage';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../utils/whatsapp';

const LAB_PHONE = '0115007257';
const LAB_EMAIL = 'alnwader.10hz@gmail.com';

export default function LabHome() {
  const { t, i18n } = useTranslation();
  const { customer, loading } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    if (!loading && customer) navigate('/dashboard', { replace: true });
  }, [loading, customer, navigate]);

  const services = [
    { key: 'cbc', icon: FlaskConical, color: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200' },
    { key: 'chemistry', icon: HeartPulse, color: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
    { key: 'parasitology', icon: Microscope, color: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' },
    { key: 'hormones', icon: ShieldCheck, color: 'bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200' },
    {
      key: 'portal',
      icon: LogIn,
      color: 'bg-primary-600 text-white shadow-md ring-2 ring-primary-400/40',
      to: '/login',
      highlight: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-app-mesh pointer-events-none" />

      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-[14rem]" />
          <div className="flex items-center gap-1 shrink-0">
            <Button type="button" variant="ghost" size="icon" onClick={toggleLanguage} title={isAr ? 'English' : 'العربية'}>
              <Globe size={18} />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button asChild size="sm" className="hidden sm:inline-flex gap-2 ms-1">
              <Link to="/login">
                <LogIn size={16} />
                {t('home.portalLogin')}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 pb-24">
        <section className="pt-10 pb-14 text-center">
          <FadeIn>
            <LabBrandLockup stacked />
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t('home.heroTagline')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2 min-w-[12rem]">
                <Link to="/login">
                  <LogIn size={18} />
                  {t('home.portalLogin')}
                </Link>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="gap-2 min-w-[12rem] bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
                onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, isAr
                  ? 'مرحباً، أرغب بالاستفسار عن خدمات المختبر'
                  : 'Hello, I would like to inquire about your laboratory services')}
              >
                <MessageCircle size={18} />
                {t('portal.whatsapp')}
              </Button>
            </div>
          </FadeIn>
        </section>

        <section id="about" className="py-10 scroll-mt-20">
          <m.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35 }}
          >
            <h2 className="text-2xl font-bold text-foreground mb-4">{t('home.aboutTitle')}</h2>
            <Card className="border-border/80 shadow-sm bg-card/95">
              <CardContent className="p-6 sm:p-8 space-y-4 text-muted-foreground leading-relaxed">
                <p>{t('home.aboutP1')}</p>
                <p>{t('home.aboutP2')}</p>
              </CardContent>
            </Card>
          </m.div>
        </section>

        <section id="services" className="py-10 scroll-mt-20">
          <m.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35 }}
          >
            <h2 className="text-2xl font-bold text-foreground mb-2">{t('home.servicesTitle')}</h2>
            <p className="text-muted-foreground mb-8">{t('home.servicesHint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map(({ key, icon: Icon, color, to, highlight }, i) => {
                const inner = (
                  <Card
                    className={`h-full transition-all hover:shadow-md border-border/80 ${
                      highlight ? 'ring-2 ring-primary-500/30 hover:ring-primary-500/50' : ''
                    }`}
                  >
                    <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color}`}>
                        <Icon size={28} strokeWidth={1.75} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{t(`home.services.${key}.title`)}</h3>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {t(`home.services.${key}.desc`)}
                        </p>
                      </div>
                      {highlight && (
                        <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                          {t('home.tapToLogin')}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                );

                return to ? (
                  <Link key={key} to={to} className="block h-full">
                    {inner}
                  </Link>
                ) : (
                  <m.div
                    key={key}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="h-full"
                  >
                    {inner}
                  </m.div>
                );
              })}
            </div>
          </m.div>
        </section>

        <section id="contact" className="py-10 scroll-mt-20">
          <h2 className="text-2xl font-bold text-foreground mb-6">{t('home.contactTitle')}</h2>
          <Card className="border-border/80 bg-card/95">
            <CardContent className="p-6 sm:p-8 grid sm:grid-cols-2 gap-6">
              <a href={`tel:${LAB_PHONE}`} className="flex items-start gap-3 group" dir="ltr">
                <Phone size={20} className="text-primary-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('home.phone')}</p>
                  <p className="text-muted-foreground group-hover:text-primary-600 transition-colors">{LAB_PHONE}</p>
                </div>
              </a>
              <a href={`mailto:${LAB_EMAIL}`} className="flex items-start gap-3 group">
                <Mail size={20} className="text-primary-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t('home.email')}</p>
                  <p className="text-muted-foreground truncate group-hover:text-primary-600 transition-colors">{LAB_EMAIL}</p>
                </div>
              </a>
              <div className="flex items-start gap-3 sm:col-span-2">
                <MapPin size={20} className="text-primary-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('home.location')}</p>
                  <p className="text-muted-foreground">{t('home.address')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border/60">
          <p>{t('portal.labName')} — {t('portal.labTagline')}</p>
          <p className="mt-2">© {new Date().getFullYear()}</p>
        </footer>
      </main>

      <WhatsAppContact />
    </div>
  );
}
