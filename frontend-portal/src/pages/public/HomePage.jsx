import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LogIn, MessageCircle, ChevronRight, ArrowRight, ShieldCheck,
  BarChart3, Layers, Package,
} from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp, AnimatedCounter } from '../../components/public/Section';
import ContactInquiry from '../../components/public/ContactInquiry';
import ContactInfo from '../../components/public/ContactInfo';
import LabBrochureViewer from '../../components/portal/LabBrochureViewer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import usePublicCatalog from '../../hooks/usePublicCatalog';
import {
  SERVICE_DEPARTMENTS, AUDIENCES, WORKFLOW_STEPS, WHY_US, PORTAL_FEATURES, QUALITY_PILLARS, COLOR_RING,
} from '../../data/siteStructure';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../../utils/whatsapp';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { stats } = usePublicCatalog();

  const fieldMsg = isAr ? 'مرحباً، أرغب بحجز خدمة ميدانية' : 'Hello, I would like to book a field service';

  const statItems = [
    { value: stats?.test_count ?? 0, label: t('site.stats.tests') },
    { value: stats?.category_count ?? 0, label: t('site.stats.departments') },
    { value: AUDIENCES.length, label: t('site.stats.species') },
    { value: stats?.package_count ?? 0, label: t('site.stats.packages') },
  ];

  return (
    <PublicLayout redirectIfLoggedIn>
      <PageMeta titleKey="site.meta.homeTitle" descKey="site.meta.homeDesc" path="/" />

      {/* Hero */}
      <section className="site-hero">
        <div className="site-hero__media" aria-hidden>
          <img src="/images/lab-hero-bg.jpg" alt="" fetchPriority="high" />
          <div className="site-hero__shade" />
        </div>
        <div className="site-hero__content site-container">
          <FadeUp className="max-w-3xl">
            <p className="site-eyebrow text-primary-200 mb-4">{t('site.hero.eyebrow')}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-[3.25rem] font-bold text-white leading-[1.12] tracking-tight">
              {t('site.hero.title')}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/85 leading-relaxed max-w-2xl">
              {t('site.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                type="button"
                size="lg"
                className="gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 shadow-lg"
                onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, fieldMsg)}
              >
                <MessageCircle size={18} />
                {t('site.hero.ctaField')}
              </Button>
              <Button asChild size="lg" variant="secondary" className="gap-2 bg-white/95 text-foreground hover:bg-white shadow-lg">
                <Link to="/tests">{t('site.hero.ctaTests')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 border-white/40 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm">
                <Link to="/login"><LogIn size={18} />{t('site.hero.ctaPortal')}</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="gap-2 text-white/90 hover:text-white hover:bg-white/10">
                <Link to="/contact">{t('site.hero.ctaContact')}</Link>
              </Button>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Stats — real catalog numbers only */}
      <Section className="!py-10 -mt-8 relative z-10">
        <div className="site-container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statItems.map(({ value, label }, i) => (
              <FadeUp key={label} delay={i * 0.06}>
                <div className="site-stat shadow-md">
                  <p className="site-stat__value"><AnimatedCounter value={value} /></p>
                  <p className="site-stat__label">{label}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* About */}
      <Section id="about">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.about.eyebrow')} title={t('site.about.title')} />
          <div className="grid lg:grid-cols-2 gap-5">
            <FadeUp>
              <Card className="site-card h-full">
                <CardContent className="p-6 sm:p-8 space-y-4 text-muted-foreground leading-relaxed">
                  <p>{t('site.about.p1')}</p>
                  <p>{t('site.about.p2')}</p>
                </CardContent>
              </Card>
            </FadeUp>
            <FadeUp delay={0.08}>
              <Card className="site-card h-full border-primary-300/40 bg-gradient-to-br from-primary-50/90 to-card dark:from-primary-950/40">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300 font-semibold mb-3">
                    <ShieldCheck size={20} />
                    {t('site.about.visionTitle')}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{t('site.about.vision')}</p>
                </CardContent>
              </Card>
            </FadeUp>
          </div>
        </div>
      </Section>

      {/* Why us */}
      <Section id="why-us" className="bg-muted/30">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.whyUs.eyebrow')} title={t('site.whyUs.title')} align="center" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WHY_US.map((key, i) => (
              <FadeUp key={key} delay={i * 0.04}>
                <div className="site-card p-5 h-full">
                  <h3 className="font-semibold text-foreground">{t(`site.whyUs.${key}.title`)}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(`site.whyUs.${key}.desc`)}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Services preview */}
      <Section id="services">
        <div className="site-container">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <SectionHeader eyebrow={t('site.nav.services')} title={t('site.meta.servicesTitle')} subtitle={t('site.meta.servicesDesc')} />
            <Button asChild variant="outline" className="shrink-0 gap-1.5">
              <Link to="/services">
                {isAr ? 'جميع الخدمات' : 'All services'}
                <ChevronRight size={16} className={isAr ? 'rotate-180' : ''} />
              </Link>
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVICE_DEPARTMENTS.slice(0, 6).map(({ id, icon: Icon, color }, i) => (
              <FadeUp key={id} delay={i * 0.04}>
                <Link to="/services" className="block h-full">
                  <div className="site-card p-5 h-full flex gap-4">
                    <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ring-1 ${COLOR_RING[color]}`}>
                      <Icon size={22} strokeWidth={1.75} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t(`site.departments.${id}.title`)}</h3>
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{t(`site.departments.${id}.desc`)}</p>
                    </div>
                  </div>
                </Link>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Audiences */}
      <Section id="audiences" className="bg-muted/20">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.audiences.eyebrow')} title={t('site.audiences.title')} align="center" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {AUDIENCES.map(({ id, image, icon: Icon }, i) => (
              <FadeUp key={id} delay={i * 0.03}>
                <div className="site-card overflow-hidden h-full">
                  {image ? (
                    <div className="aspect-[4/3] relative">
                      <img src={image} alt={t(`site.audiences.${id}.title`)} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <h3 className="absolute bottom-3 inset-x-3 font-bold text-white text-sm sm:text-base">{t(`site.audiences.${id}.title`)}</h3>
                    </div>
                  ) : (
                    <div className="p-5 flex flex-col gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                        <Icon size={22} className="text-primary-700" />
                      </div>
                      <h3 className="font-semibold">{t(`site.audiences.${id}.title`)}</h3>
                    </div>
                  )}
                  <div className="p-4 pt-3">
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{t(`site.audiences.${id}.desc`)}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Workflow */}
      <Section id="workflow">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.workflow.eyebrow')} title={t('site.workflow.title')} align="center" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKFLOW_STEPS.map((key, i) => (
              <FadeUp key={key} delay={i * 0.05}>
                <div className="site-workflow-step h-full" data-step={i + 1}>
                  <h3 className="font-semibold text-foreground">{t(`site.workflow.${key}.title`)}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(`site.workflow.${key}.desc`)}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Portal showcase */}
      <Section id="portal" className="bg-gradient-to-br from-primary-950/5 via-transparent to-primary-100/30 dark:from-primary-950/40">
        <div className="site-container">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <FadeUp>
              <SectionHeader eyebrow={t('site.portal.eyebrow')} title={t('site.portal.title')} subtitle={t('site.portal.subtitle')} />
              <Button asChild size="lg" className="gap-2">
                <Link to="/login"><LogIn size={18} />{t('site.portal.cta')}<ArrowRight size={16} className={isAr ? 'rotate-180' : ''} /></Link>
              </Button>
            </FadeUp>
            <div className="grid sm:grid-cols-2 gap-3">
              {PORTAL_FEATURES.map((key, i) => {
                const icons = { results: BarChart3, pdf: Layers, compare: BarChart3, archive: Package, share: MessageCircle };
                const Icon = icons[key] || BarChart3;
                return (
                  <FadeUp key={key} delay={i * 0.05}>
                    <div className="site-card p-4 flex gap-3">
                      <Icon size={20} className="text-primary-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-sm">{t(`site.portal.${key}.title`)}</h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(`site.portal.${key}.desc`)}</p>
                      </div>
                    </div>
                  </FadeUp>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Quality preview */}
      <Section id="quality">
        <div className="site-container">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <SectionHeader eyebrow={t('site.quality.eyebrow')} title={t('site.quality.title')} />
            <Button asChild variant="outline" className="shrink-0 gap-1.5">
              <Link to="/quality">{isAr ? 'معايير الجودة' : 'Quality standards'}<ChevronRight size={16} className={isAr ? 'rotate-180' : ''} /></Link>
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUALITY_PILLARS.map((key, i) => (
              <FadeUp key={key} delay={i * 0.05}>
                <div className="site-card p-5 h-full">
                  <h3 className="font-semibold">{t(`site.quality.${key}.title`)}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(`site.quality.${key}.desc`)}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Brochure */}
      <Section id="brochure" className="bg-muted/25">
        <div className="site-container">
          <SectionHeader title={t('home.brochureTitle')} subtitle={t('home.brochureHint')} />
          <FadeUp>
            <Card className="site-card overflow-hidden bg-[#e8e4de] dark:bg-card/95">
              <CardContent className="p-2 sm:p-4">
                <LabBrochureViewer />
              </CardContent>
            </Card>
            <div className="mt-4 text-center">
              <Button asChild variant="outline" size="sm">
                <a href="/lab-profile.pdf" target="_blank" rel="noopener noreferrer">{t('home.openPdf')}</a>
              </Button>
            </div>
          </FadeUp>
        </div>
      </Section>

      {/* Contact */}
      <Section id="contact">
        <div className="site-container">
          <SectionHeader title={t('home.contactTitle')} subtitle={t('home.contactHint')} />
          <div className="grid lg:grid-cols-2 gap-5">
            <FadeUp><ContactInfo /></FadeUp>
            <FadeUp delay={0.08}><ContactInquiry /></FadeUp>
          </div>
        </div>
      </Section>
    </PublicLayout>
  );
}
