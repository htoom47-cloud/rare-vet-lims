import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';
import usePublicCatalog from '../../hooks/usePublicCatalog';
import { SERVICE_DEPARTMENTS, COLOR_RING } from '../../data/siteStructure';
import { Button } from '../../components/ui/button';
import { ChevronRight } from 'lucide-react';

export default function ServicesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { tests, loading } = usePublicCatalog();

  const testsForDept = (dept) => {
    if (!dept.categories?.length) return [];
    return tests.filter((test) => dept.categories.includes(test.category_code));
  };

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.servicesTitle" descKey="site.meta.servicesDesc" path="/services" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.nav.services')} title={t('site.meta.servicesTitle')} subtitle={t('site.meta.servicesDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container space-y-8">
          {SERVICE_DEPARTMENTS.map(({ id, icon: Icon, color, categories }, i) => {
            const deptTests = testsForDept({ categories });
            const sampleTests = deptTests.slice(0, 8);
            return (
              <FadeUp key={id} delay={i * 0.03}>
                <article className="site-card p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
                    <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ${COLOR_RING[color]}`}>
                      <Icon size={28} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t(`site.departments.${id}.title`)}</h2>
                      <p className="text-muted-foreground mt-2 leading-relaxed max-w-3xl">{t(`site.departments.${id}.desc`)}</p>
                      <p className="text-sm text-muted-foreground/80 mt-3">
                        <span className="font-medium text-foreground">{isAr ? 'أهم الفحوصات: ' : 'Key tests: '}</span>
                        {t(`site.departments.${id}.tests`)}
                      </p>

                      {!loading && sampleTests.length > 0 && (
                        <ul className="mt-5 flex flex-wrap gap-2">
                          {sampleTests.map((test) => (
                            <li key={test.id}>
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
                                {isAr && test.name_ar ? test.name_ar : test.name}
                              </span>
                            </li>
                          ))}
                          {deptTests.length > 8 && (
                            <li className="text-xs text-muted-foreground self-center">
                              +{deptTests.length - 8}
                            </li>
                          )}
                        </ul>
                      )}

                      {categories.length > 0 && (
                        <Button asChild variant="link" className="mt-4 px-0 gap-1 h-auto">
                          <Link to={`/tests?dept=${id}`}>
                            {isAr ? 'عرض جميع الفحوصات' : 'View all tests'}
                            <ChevronRight size={14} className={isAr ? 'rotate-180' : ''} />
                          </Link>
                        </Button>
                      )}
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
