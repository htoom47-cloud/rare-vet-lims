import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sun, Moon, Globe, FlaskConical, Microscope, HeartPulse, ShieldCheck,
  LogIn, Phone, Mail, MapPin, MessageCircle, Clock, Dna, TestTubes,
  FileSearch, Package, Users, Award, Target, ChevronRight,
} from 'lucide-react';
import { m } from 'framer-motion';
import { usePortal } from '../context/PortalContext';
import { useTheme } from '../context/ThemeContext';
import LabBrandLockup from '../components/portal/LabBrandLockup';
import LabBrochureViewer from '../components/portal/LabBrochureViewer';
import WhatsAppContact from '../components/portal/WhatsAppContact';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { FadeIn } from '../components/motion/AnimatedPage';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../utils/whatsapp';

const LAB_PHONE = '0115007257';
const LAB_EMAIL = 'alnwader.10hz@gmail.com';

const sectionAnim = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-48px' },
  transition: { duration: 0.35 },
};

function SectionHeading({ title, hint }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{title}</h2>
      {hint && <p className="text-muted-foreground mt-2 max-w-2xl leading-relaxed">{hint}</p>}
    </div>
  );
}

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

  const cls = 'flex items-start gap-3 p-4 rounded-xl border border-border/70 bg-card/80 hover:border-primary-300/60 transition-colors';
  if (href) {
    return (
      <a href={href} className={`${cls} group`} dir={dir}>
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export default function LabHome() {
  const { t, i18n } = useTranslation();
  const { customer, loading } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const [inquiry, setInquiry] = useState({ name: '', phone: '', message: '' });

  useEffect(() => {
    if (!loading && customer) navigate('/dashboard', { replace: true });
  }, [loading, customer, navigate]);

  const navLinks = [
    { id: 'about', label: t('home.navAbout') },
    { id: 'animals', label: t('home.navAnimals') },
    { id: 'services', label: t('home.navServices') },
    { id: 'brochure', label: t('home.navBrochure') },
    { id: 'contact', label: t('home.navContact') },
  ];

  const stats = [
    { key: 'panels', icon: TestTubes },
    { key: 'species', icon: Users },
    { key: 'accuracy', icon: Award },
    { key: 'turnaround', icon: Clock },
  ];

  const animals = [
    { key: 'camel', emoji: '🐪' },
    { key: 'horse', emoji: '🐎' },
    { key: 'sheep', emoji: '🐑' },
  ];

  const services = [
    { key: 'cbc', icon: FlaskConical, color: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200' },
    { key: 'chemistry', icon: HeartPulse, color: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
    { key: 'parasitology', icon: Microscope, color: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' },
    { key: 'hormones', icon: ShieldCheck, color: 'bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200' },
    { key: 'microbiology', icon: Dna, color: 'bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200' },
    { key: 'research', icon: FileSearch, color: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' },
    { key: 'packages', icon: Package, color: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200' },
    {
      key: 'portal',
      icon: LogIn,
      color: 'bg-primary-600 text-white shadow-md',
      to: '/login',
      highlight: true,
    },
  ];

  const values = [
    { key: 'accuracy', icon: Target },
    { key: 'standards', icon: Award },
    { key: 'care', icon: HeartPulse },
  ];

  const sendInquiry = (e) => {
    e.preventDefault();
    const lines = isAr
      ? [
          'استفسار من موقع المختبر',
          inquiry.name && `الاسم: ${inquiry.name}`,
          inquiry.phone && `الجوال: ${inquiry.phone}`,
          inquiry.message && `الرسالة: ${inquiry.message}`,
        ].filter(Boolean)
      : [
          'Inquiry from lab website',
          inquiry.name && `Name: ${inquiry.name}`,
          inquiry.phone && `Mobile: ${inquiry.phone}`,
          inquiry.message && `Message: ${inquiry.message}`,
        ].filter(Boolean);
    openWhatsApp(LAB_WHATSAPP_PHONE, lines.join('\n'));
  };

  return (
    <div className="min-h-screen bg-[#ebe6df] dark:bg-background relative overflow-x-hidden" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-app-mesh pointer-events-none opacity-60" />

      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/95 backdrop-blur-md shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-[11rem] sm:max-w-[14rem]" />
          <div className="flex items-center gap-1 shrink-0">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={toggleLanguage}>
              <Globe size={17} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
            <Button
              type="button"
              size="sm"
              className="hidden md:inline-flex h-9 gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
              onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, isAr ? 'مرحباً، أرغب بالاستفسار عن خدمات المختبر' : 'Hello, I would like to inquire about your laboratory services')}
            >
              <MessageCircle size={15} />
              {t('portal.whatsapp')}
            </Button>
            <Button asChild size="sm" className="h-9 gap-1.5">
              <Link to="/login">
                <LogIn size={15} />
                <span className="hidden sm:inline">{t('home.portalLogin')}</span>
              </Link>
            </Button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-3 sm:px-4 pb-2 flex gap-1 overflow-x-auto scrollbar-none">
          {navLinks.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-full text-muted-foreground hover:text-foreground hover:bg-primary-100/80 dark:hover:bg-primary-900/30 transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-3 sm:px-4 pb-20">
        {/* Hero */}
        <section className="pt-10 sm:pt-14 pb-12 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-600/10 text-primary-800 dark:text-primary-200 text-xs font-semibold mb-6">
              {t('portal.labTagline')}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight max-w-3xl mx-auto">
              {t('home.heroTitle')}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t('home.heroSubtitle')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2 min-w-[13rem] shadow-md">
                <Link to="/login">
                  <LogIn size={18} />
                  {t('home.portalLogin')}
                </Link>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="gap-2 min-w-[13rem] bg-[#25D366] hover:bg-[#20bd5a] text-white border-0"
                onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, isAr ? 'مرحباً، أرغب بالاستفسار عن خدمات المختبر' : 'Hello, I would like to inquire about your laboratory services')}
              >
                <MessageCircle size={18} />
                {t('portal.whatsapp')}
              </Button>
            </div>
          </FadeIn>
        </section>

        {/* Stats */}
        <section className="pb-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {stats.map(({ key, icon: Icon }) => (
              <Card key={key} className="border-border/70 bg-card/90 shadow-sm">
                <CardContent className="p-4 sm:p-5 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0">
                    <Icon size={22} className="text-primary-700 dark:text-primary-300" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{t(`home.stats.${key}.value`)}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t(`home.stats.${key}.label`)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* About */}
        <section id="about" className="py-10 scroll-mt-28">
          <m.div {...sectionAnim}>
            <SectionHeading title={t('home.aboutTitle')} hint={t('home.aboutHint')} />
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="border-border/80 bg-card/95 shadow-sm">
                <CardContent className="p-6 sm:p-8 space-y-4 text-muted-foreground leading-relaxed">
                  <p>{t('home.aboutP1')}</p>
                  <p>{t('home.aboutP2')}</p>
                </CardContent>
              </Card>
              <Card className="border-primary-300/40 bg-gradient-to-br from-primary-50/80 to-card dark:from-primary-950/30 dark:to-card shadow-sm">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300 font-semibold mb-3">
                    <Target size={20} />
                    {t('home.visionTitle')}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{t('home.visionText')}</p>
                </CardContent>
              </Card>
            </div>
          </m.div>
        </section>

        {/* Animals */}
        <section id="animals" className="py-10 scroll-mt-28">
          <m.div {...sectionAnim}>
            <SectionHeading title={t('home.animalsTitle')} hint={t('home.animalsHint')} />
            <div className="grid sm:grid-cols-3 gap-4">
              {animals.map(({ key, emoji }) => (
                <Card key={key} className="border-border/80 bg-card/95 overflow-hidden group hover:shadow-md transition-shadow">
                  <CardContent className="p-6 text-center">
                    <span className="text-4xl" role="img" aria-hidden>{emoji}</span>
                    <h3 className="font-bold text-lg text-foreground mt-4">{t(`home.animals.${key}.title`)}</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(`home.animals.${key}.desc`)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </m.div>
        </section>

        {/* Values */}
        <section className="py-6">
          <div className="grid sm:grid-cols-3 gap-3">
            {values.map(({ key, icon: Icon }) => (
              <div key={key} className="flex items-start gap-3 p-4 rounded-2xl border border-border/60 bg-card/70">
                <Icon size={20} className="text-primary-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground text-sm">{t(`home.values.${key}.title`)}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(`home.values.${key}.desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Services */}
        <section id="services" className="py-10 scroll-mt-28">
          <m.div {...sectionAnim}>
            <SectionHeading title={t('home.servicesTitle')} hint={t('home.servicesHint')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {services.map(({ key, icon: Icon, color, to, highlight }, i) => {
                const card = (
                  <Card className={`h-full transition-all hover:shadow-md border-border/80 ${highlight ? 'ring-2 ring-primary-500/40' : ''}`}>
                    <CardContent className="p-5 flex flex-col gap-3 h-full">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                        <Icon size={24} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{t(`home.services.${key}.title`)}</h3>
                        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{t(`home.services.${key}.desc`)}</p>
                      </div>
                      {highlight && (
                        <span className="text-xs font-medium text-primary-600 dark:text-primary-400 flex items-center gap-1">
                          {t('home.tapToLogin')}
                          <ChevronRight size={14} className={isAr ? 'rotate-180' : ''} />
                        </span>
                      )}
                    </CardContent>
                  </Card>
                );

                return to ? (
                  <Link key={key} to={to} className="block h-full">{card}</Link>
                ) : (
                  <m.div key={key} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="h-full">
                    {card}
                  </m.div>
                );
              })}
            </div>
          </m.div>
        </section>

        {/* Brochure PDF */}
        <section id="brochure" className="py-10 scroll-mt-28">
          <m.div {...sectionAnim}>
            <SectionHeading title={t('home.brochureTitle')} hint={t('home.brochureHint')} />
            <Card className="border-border/80 bg-[#e8e4de] dark:bg-card/95 overflow-hidden shadow-md">
              <CardContent className="p-2 sm:p-4">
                <LabBrochureViewer />
              </CardContent>
            </Card>
            <div className="mt-4 text-center">
              <Button asChild variant="outline" size="sm">
                <a href="/lab-profile.pdf" target="_blank" rel="noopener noreferrer">
                  {t('home.openPdf')}
                </a>
              </Button>
            </div>
          </m.div>
        </section>

        {/* Contact + Inquiry */}
        <section id="contact" className="py-10 scroll-mt-28">
          <m.div {...sectionAnim}>
            <SectionHeading title={t('home.contactTitle')} hint={t('home.contactHint')} />
            <div className="grid lg:grid-cols-2 gap-4">
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

              <Card className="border-border/80 bg-card/95 shadow-sm">
                <CardContent className="p-6">
                  <h3 className="font-bold text-foreground mb-1">{t('home.inquiryTitle')}</h3>
                  <p className="text-sm text-muted-foreground mb-5">{t('home.inquiryHint')}</p>
                  <form onSubmit={sendInquiry} className="space-y-4">
                    <div>
                      <Label htmlFor="inq-name">{t('home.inquiryName')}</Label>
                      <Input
                        id="inq-name"
                        value={inquiry.name}
                        onChange={(e) => setInquiry((s) => ({ ...s, name: e.target.value }))}
                        className="mt-1.5"
                        placeholder={t('home.inquiryNamePh')}
                      />
                    </div>
                    <div>
                      <Label htmlFor="inq-phone">{t('home.inquiryPhone')}</Label>
                      <Input
                        id="inq-phone"
                        type="tel"
                        dir="ltr"
                        value={inquiry.phone}
                        onChange={(e) => setInquiry((s) => ({ ...s, phone: e.target.value }))}
                        className="mt-1.5"
                        placeholder="05xxxxxxxx"
                      />
                    </div>
                    <div>
                      <Label htmlFor="inq-msg">{t('home.inquiryMessage')}</Label>
                      <textarea
                        id="inq-msg"
                        rows={3}
                        value={inquiry.message}
                        onChange={(e) => setInquiry((s) => ({ ...s, message: e.target.value }))}
                        className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder={t('home.inquiryMessagePh')}
                      />
                    </div>
                    <Button type="submit" className="w-full gap-2">
                      <MessageCircle size={16} />
                      {t('home.inquirySend')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </m.div>
        </section>

        <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border/60">
          <LabBrandLockup compact embedded noDivider className="!w-auto mx-auto max-w-xs mb-3 opacity-80" />
          <p>© {new Date().getFullYear()} — {t('portal.labName')}</p>
        </footer>
      </main>

      <WhatsAppContact />
    </div>
  );
}
