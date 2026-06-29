import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Clock, FlaskConical, Filter, Layers } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, FadeUp } from '../../components/public/Section';
import usePublicCatalog from '../../hooks/usePublicCatalog';
import { deptIdForCategory, categoriesForAnimal, categoriesForDept, testsForDept } from '../../utils/catalogHelpers';
import { SERVICE_DEPARTMENTS, ANIMAL_FILTERS } from '../../data/siteStructure';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';

function formatTat(hours, isAr) {
  if (!hours) return isAr ? 'حسب الفحص' : 'Varies';
  if (hours < 24) return isAr ? `${hours} ساعة` : `${hours}h`;
  const days = Math.round(hours / 24);
  return isAr ? `${days} يوم` : `${days} day${days > 1 ? 's' : ''}`;
}

export default function TestsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [searchParams, setSearchParams] = useSearchParams();
  const deptFilter = searchParams.get('dept') || 'all';
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [animalId, setAnimalId] = useState('all');
  const { tests, categories, loading, error, stats } = usePublicCatalog();

  useEffect(() => {
    if (deptFilter !== 'all') setCategoryId('all');
  }, [deptFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const animalCats = categoriesForAnimal(animalId);
    const deptCats = deptFilter !== 'all' ? categoriesForDept(deptFilter) : null;

    let pool = tests;
    if (deptFilter !== 'all') {
      pool = testsForDept(tests, deptFilter);
    }

    return pool.filter((test) => {
      if (categoryId !== 'all' && String(test.category_id) !== categoryId) return false;
      if (animalCats?.length && !animalCats.includes(test.category_code)) return false;
      if (deptCats?.length && deptFilter !== 'all' && !deptCats.includes(test.category_code) && deptFilter !== 'parasitology' && deptFilter !== 'microbiology') return false;
      if (!q) return true;
      const hay = [test.name, test.name_ar, test.code, test.description, test.category_name, test.category_name_ar].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [tests, query, categoryId, animalId, deptFilter]);

  const setDept = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'all') next.delete('dept');
    else next.set('dept', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.testsTitle" descKey="site.meta.testsDesc" path="/tests" />

      <div className="site-page-hero site-container pb-8">
        <p className="site-eyebrow mb-3">{t('site.nav.tests')}</p>
        <h1 className="site-heading max-w-2xl">{t('site.testsPage.heroTitle')}</h1>
        <p className="site-subheading mt-4 max-w-2xl">{t('site.testsPage.heroDesc')}</p>
        {stats?.test_count > 0 && (
          <p className="text-sm text-muted-foreground mt-3">
            {t('site.common.resultsCount', { count: filtered.length })}
            {' / '}
            {stats.test_count}
          </p>
        )}
      </div>

      <Section className="!pt-0">
        <div className="site-container">
          <FadeUp>
            <div className="site-tests-toolbar">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <Filter size={14} />
                {t('site.testsPage.filterTitle')}
              </p>
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('site.testsPage.search')}
                    className="ps-10 h-11"
                    aria-label={t('site.testsPage.search')}
                  />
                </div>
                <select
                  value={animalId}
                  onChange={(e) => setAnimalId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('site.testsPage.allAnimals')}
                >
                  {ANIMAL_FILTERS.map(({ id }) => (
                    <option key={id} value={id}>
                      {id === 'all' ? t('site.testsPage.allAnimals') : t(`site.audiences.${id}.title`)}
                    </option>
                  ))}
                </select>
                <select
                  value={deptFilter}
                  onChange={(e) => setDept(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('site.testsPage.allDepts')}
                >
                  <option value="all">{t('site.testsPage.allDepts')}</option>
                  {SERVICE_DEPARTMENTS.filter((d) => d.categories.length > 0 || d.id === 'parasitology').map(({ id }) => (
                    <option key={id} value={id}>{t(`site.departments.${id}.title`)}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex h-10 w-full sm:w-auto min-w-[12rem] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('site.testsPage.allCategories')}
                >
                  <option value="all">{t('site.testsPage.allCategories')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>
                      {isAr && cat.name_ar ? cat.name_ar : cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </FadeUp>

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((n) => <Skeleton key={n} className="h-28 w-full rounded-xl" />)}
            </div>
          )}

          {error && (
            <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 rounded-xl p-4 mb-6">
              {t('site.testsPage.error')}
            </p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-20">{t('site.testsPage.noResults')}</p>
          )}

          <div className="space-y-3">
            {filtered.map((test, i) => {
              const deptId = deptIdForCategory(test.category_code);
              const deptLabel = deptId ? t(`site.departments.${deptId}.title`) : (isAr && test.category_name_ar ? test.category_name_ar : test.category_name);
              return (
                <FadeUp key={test.id} delay={Math.min(i * 0.015, 0.15)}>
                  <article className="site-test-card">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-foreground">
                            {isAr && test.name_ar ? test.name_ar : test.name}
                          </h2>
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md" dir="ltr">
                            {test.code}
                          </span>
                        </div>
                        {test.description ? (
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{test.description}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-2 italic opacity-70">
                            {isAr ? 'فحص مخبري معتمد — تواصل معنا لتفاصيل العينة.' : 'Validated laboratory test — contact us for sample details.'}
                          </p>
                        )}
                        <div className="site-test-card__meta">
                          <span className="site-test-card__tag">
                            <Layers size={12} />
                            {t('site.testsPage.department')}: {isAr && test.category_name_ar ? test.category_name_ar : test.category_name}
                          </span>
                          {deptId && (
                            <Link to={`/services#${deptId}`} className="site-test-card__tag site-test-card__tag--link">
                              {t('site.testsPage.service')}: {deptLabel}
                            </Link>
                          )}
                          <span className="site-test-card__tag">
                            <Clock size={12} />
                            {t('site.testsPage.tat')}: {formatTat(test.turnaround_hours, isAr)}
                          </span>
                          {test.requires_specimen && (
                            <span className="site-test-card__tag">
                              <FlaskConical size={12} />
                              {t('site.testsPage.sample')}: {test.requires_specimen}
                            </span>
                          )}
                          {test.method && (
                            <span className="site-test-card__tag">{t('site.testsPage.method')}: {test.method}</span>
                          )}
                        </div>
                      </div>
                      {deptId && (
                        <Link
                          to={`/tests?dept=${deptId}`}
                          className="text-sm font-medium text-primary-700 hover:text-primary-900 shrink-0"
                        >
                          {t('site.common.viewTests')} →
                        </Link>
                      )}
                    </div>
                  </article>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </Section>
    </PublicLayout>
  );
}
