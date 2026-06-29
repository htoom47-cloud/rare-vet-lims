import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Target, Clock, PawPrint } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';
import usePublicCatalog from '../../hooks/usePublicCatalog';
import { testsForDept } from '../../utils/catalogHelpers';
import { SERVICE_DEPARTMENTS, COLOR_RING } from '../../data/siteStructure';
import { Button } from '../../components/ui/button';

export default function ServicesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { tests, loading } = usePublicCatalog();

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.servicesTitle" descKey="site.meta.servicesDesc" path="/services" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.nav.services')} title={t('site.meta.servicesTitle')} subtitle={t('site.meta.servicesDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container space-y-16 lg:space-y-24">
          {SERVICE_DEPARTMENTS.map(({ id, icon: Icon, color, image, categories }, i) => {
            const deptTests = testsForDept(tests, id);
            const reverse = i % 2 === 1;
            return (
              <FadeUp key={id} delay={0.03}>
                <article id={id} className={`site-service-detail ${reverse ? 'site-service-detail--reverse' : ''}`}>
                  <div className="site-service-detail__media order-first">
                    <img src={image || '/images/lab/interior.jpg'} alt={t(`site.departments.${id}.title`)} loading="lazy" />
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-start gap-4">
                      <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ${COLOR_RING[color]}`}>
                        <Icon size={28} strokeWidth={1.5} />
                      </div>
                      <div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{t(`site.departments.${id}.title`)}</h2>
                        <p className="text-muted-foreground mt-2 leading-relaxed text-base">{t(`site.departments.${id}.desc`)}</p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="site-service-detail__panel">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                          <Target size={16} className="text-primary-600" />
                          {t('site.servicesPage.benefit')}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t(`site.departments.${id}.benefit`)}</p>
                      </div>
                      <div className="site-service-detail__panel">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                          <Clock size={16} className="text-primary-600" />
                          {t('site.servicesPage.when')}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t(`site.departments.${id}.when`)}</p>
                      </div>
                    </div>

                    <div className="site-service-detail__panel">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                        <PawPrint size={16} className="text-primary-600" />
                        {t('site.servicesPage.animals')}
                      </div>
                      <p className="text-sm text-muted-foreground">{t(`site.departments.${id}.animals`)}</p>
                    </div>

                    {!loading && deptTests.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          {t(`site.departments.${id}.tests`)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {deptTests.slice(0, 10).map((test) => (
                            <Link
                              key={test.id}
                              to={`/tests?dept=${id}`}
                              className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-muted hover:bg-primary-100 dark:hover:bg-primary-900/30 text-foreground transition-colors"
                            >
                              {isAr && test.name_ar ? test.name_ar : test.name}
                            </Link>
                          ))}
                          {deptTests.length > 10 && (
                            <span className="text-xs text-muted-foreground self-center">+{deptTests.length - 10}</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 pt-2">
                      {categories.length > 0 || id === 'parasitology' ? (
                        <Button asChild size="lg" className="gap-1.5">
                          <Link to={`/tests?dept=${id}`}>
                            {t('site.servicesPage.viewTests')}
                            <ChevronRight size={16} className={isAr ? 'rotate-180' : ''} />
                          </Link>
                        </Button>
                      ) : (
                        <Button size="lg" className="gap-1.5" asChild>
                          <Link to="/contact">{t('site.common.bookField')}</Link>
                        </Button>
                      )}
                      <Button asChild variant="outline" size="lg">
                        <Link to="/contact">{t('site.hero.ctaContact')}</Link>
                      </Button>
                    </div>
                  </div>
                </article>
              </FadeUp>
            );
          })}
        </div>
      </Section>
    </PublicLayout>
  );
}
