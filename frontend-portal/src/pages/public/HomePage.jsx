import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LogIn, MessageCircle, ChevronRight, ArrowRight, ShieldCheck, Check,
  BarChart3, Layers, Package,
} from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp, AnimatedCounter } from '../../components/public/Section';
import ServiceCard from '../../components/public/ServiceCard';
import WorkflowTimeline from '../../components/public/WorkflowTimeline';
import ContactInquiry from '../../components/public/ContactInquiry';
import ContactInfo from '../../components/public/ContactInfo';
import LabBrochureViewer from '../../components/portal/LabBrochureViewer';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import usePublicCatalog from '../../hooks/usePublicCatalog';
import { testsForDept } from '../../utils/catalogHelpers';
import {
  SERVICE_DEPARTMENTS, WORKFLOW_STEPS, WHY_US, HERO_BADGES,
  PORTAL_FEATURES, EQUIPMENT, CREDIBILITY,
} from '../../data/siteStructure';
import { LAB_WHATSAPP_PHONE, openWhatsApp } from '../../utils/whatsapp';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { stats, tests } = usePublicCatalog();

  const fieldMsg = isAr ? 'مرحباً، أرغب بحجز خدمة ميدانية' : 'Hello, I would like to book a field service';

  const statItems = [
    { value: stats?.analysis_count ?? 0, label: t('site.stats.analyses') },
    { value: stats?.customer_count ?? 0, label: t('site.stats.customers') },
    { value: stats?.sample_count ?? 0, label: t('site.stats.samples') },
    { value: stats?.test_count ?? 0, label: t('site.stats.tests') },
  ];

  const homeServices = SERVICE_DEPARTMENTS.filter((d) => !['fieldCollection', 'fieldServices'].includes(d.id)).slice(0, 6);

  return (
    <PublicLayout redirectIfLoggedIn>
      <PageMeta titleKey="site.meta.homeTitle" descKey="site.meta.homeDesc" path="/" />

      {/* Hero */}
      <section className="site-hero site-hero--premium">
        <div className="site-hero__media" aria-hidden>
          <img src="/images/lab-hero-bg.jpg" alt="" fetchPriority="high" />
          <div className="site-hero__shade" />
        </div>
        <div className="site-hero__content site-container">
          <FadeUp className="max-w-4xl">
            <p className="site-eyebrow text-primary-200 mb-4">{t('site.hero.eyebrow')}</p>
            <h1 className="site-hero__title">{t('site.hero.title')}</h1>
            <div className="site-hero__lines">
              <p>{t('site.hero.line1')}</p>
              <p className="mt-2 opacity-90">{t('site.hero.line2')}</p>
            </div>
            <div className="site-hero__badges">
              {HERO_BADGES.map((key) => (
                <span key={key} className="site-hero__badge">
                  <Check size={14} strokeWidth={2.5} />
                  {t(`site.hero.badges.${key}`)}
                </span>
              ))}
            </div>
            <div className="site-hero__actions">
              <Button type="button" size="lg" className="gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0 shadow-lg h-12 px-6" onClick={() => openWhatsApp(LAB_WHATSAPP_PHONE, fieldMsg)}>
                <MessageCircle size={18} />
                {t('site.hero.ctaField')}
              </Button>
              <Button asChild size="lg" className="gap-2 h-12 px-6 shadow-lg">
                <Link to="/tests">{t('site.hero.ctaTests')}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="gap-2 bg-white/95 text-foreground hover:bg-white h-12 px-6">
                <Link to="/services">{t('site.hero.ctaServices')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 border-white/40 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm h-12 px-6">
                <Link to="/login"><LogIn size={18} />{t('site.hero.ctaPortal')}</Link>
              </Button>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Stats */}
      <Section className="!py-12 -mt-6 relative z-10">
        <div className="site-container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statItems.map(({ value, label }, i) => (
              <FadeUp key={label} delay={i * 0.06}>
                <div className="site-stat shadow-lg border-primary-200/30 dark:border-primary-800/30">
                  <p className="site-stat__value"><AnimatedCounter value={value} /></p>
                  <p className="site-stat__label">{label}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Services cards */}
      <Section id="services">
        <div className="site-container">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
            <SectionHeader eyebrow={t('site.nav.services')} title={t('site.meta.servicesTitle')} subtitle={t('site.meta.servicesDesc')} />
            <Button asChild variant="outline" className="shrink-0 gap-1.5 h-10">
              <Link to="/services">{t('site.common.allServices')}<ChevronRight size={16} className={isAr ? 'rotate-180' : ''} /></Link>
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {homeServices.map((dept, i) => (
              <FadeUp key={dept.id} delay={i * 0.04}>
                <ServiceCard {...dept} testCount={testsForDept(tests, dept.id).length} />
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Why us */}
      <Section id="why-us" className="bg-muted/35">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.whyUs.eyebrow')} title={t('site.whyUs.title')} align="center" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {WHY_US.map((key, i) => (
              <FadeUp key={key} delay={i * 0.04}>
                <div className="site-why-card">
                  <p className="site-why-card__num">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="font-semibold text-foreground">{t(`site.whyUs.${key}.title`)}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(`site.whyUs.${key}.desc`)}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Equipment preview */}
      <Section id="equipment">
        <div className="site-container">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <SectionHeader eyebrow={t('site.equipment.eyebrow')} title={t('site.equipment.title')} />
            <Button asChild variant="outline" className="shrink-0 gap-1.5">
              <Link to="/equipment">{t('site.common.learnMore')}<ChevronRight size={16} className={isAr ? 'rotate-180' : ''} /></Link>
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EQUIPMENT.slice(0, 6).map(({ id, image }, i) => (
              <FadeUp key={id} delay={i * 0.05}>
                <Link to="/equipment" className="site-equip-card block h-full">
                  <div className="site-equip-card__img">
                    <img src={image} alt={t(`site.equipment.${id}.name`)} loading="lazy" />
                  </div>
                  <div className="site-equip-card__body">
                    <h3 className="font-semibold text-foreground">{t(`site.equipment.${id}.name`)}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t(`site.equipment.${id}.use`)}</p>
                  </div>
                </Link>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Credibility — real brochure photos */}
      <Section className="bg-muted/20">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.credibility.eyebrow')} title={t('site.credibility.title')} align="center" />
          <div className="site-credibility-grid">
            {CREDIBILITY.map(({ id, image }, i) => (
              <FadeUp key={id} delay={i * 0.06}>
                <figure className="site-credibility-card">
                  <img src={image} alt={t(`site.credibility.${id}.title`)} loading="lazy" />
                  <figcaption className="site-credibility-card__cap">
                    <h3 className="font-semibold text-sm">{t(`site.credibility.${id}.title`)}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(`site.credibility.${id}.desc`)}</p>
                  </figcaption>
                </figure>
              </FadeUp>
            ))}
          </div>
        </div>
      </Section>

      {/* Workflow timeline */}
      <Section id="workflow">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.workflow.eyebrow')} title={t('site.workflow.title')} align="center" />
          <WorkflowTimeline steps={WORKFLOW_STEPS} />
        </div>
      </Section>

      {/* About */}
      <Section id="about" className="bg-muted/25">
        <div className="site-container">
          <SectionHeader eyebrow={t('site.about.eyebrow')} title={t('site.about.title')} />
          <div className="grid lg:grid-cols-2 gap-6">
            <FadeUp>
              <Card className="site-card h-full border-0 shadow-md">
                <CardContent className="p-8 space-y-4 text-muted-foreground leading-relaxed text-base">
                  <p>{t('site.about.p1')}</p>
                  <p>{t('site.about.p2')}</p>
                </CardContent>
              </Card>
            </FadeUp>
            <FadeUp delay={0.08}>
              <Card className="site-card h-full border-primary-300/40 bg-gradient-to-br from-primary-50/90 to-card dark:from-primary-950/40 shadow-md">
                <CardContent className="p-8">
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

      {/* Portal */}
      <Section id="portal">
        <div className="site-container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <FadeUp>
              <SectionHeader eyebrow={t('site.portal.eyebrow')} title={t('site.portal.title')} subtitle={t('site.portal.subtitle')} />
              <Button asChild size="lg" className="gap-2 h-11">
                <Link to="/login"><LogIn size={18} />{t('site.portal.cta')}<ArrowRight size={16} className={isAr ? 'rotate-180' : ''} /></Link>
              </Button>
            </FadeUp>
            <div className="grid sm:grid-cols-2 gap-3">
              {PORTAL_FEATURES.map((key, i) => {
                const icons = { results: BarChart3, pdf: Layers, compare: BarChart3, archive: Package, share: MessageCircle };
                const Icon = icons[key] || BarChart3;
                return (
                  <FadeUp key={key} delay={i * 0.05}>
                    <div className="site-card p-4 flex gap-3 !transform-none">
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

      {/* Brochure */}
      <Section id="brochure" className="bg-muted/25">
        <div className="site-container">
          <SectionHeader title={t('home.brochureTitle')} subtitle={t('home.brochureHint')} />
          <FadeUp>
            <Card className="site-card overflow-hidden bg-[#e8e4de] dark:bg-card/95 shadow-md">
              <CardContent className="p-2 sm:p-4">
                <LabBrochureViewer />
              </CardContent>
            </Card>
          </FadeUp>
        </div>
      </Section>

      {/* Contact */}
      <Section id="contact">
        <div className="site-container">
          <SectionHeader title={t('home.contactTitle')} subtitle={t('home.contactHint')} />
          <div className="grid lg:grid-cols-2 gap-6">
            <FadeUp><ContactInfo /></FadeUp>
            <FadeUp delay={0.08}><ContactInquiry /></FadeUp>
          </div>
        </div>
      </Section>
    </PublicLayout>
  );
}
