import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Clock, FlaskConical, Filter } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';
import usePublicCatalog from '../../hooks/usePublicCatalog';
import { SERVICE_DEPARTMENTS } from '../../data/siteStructure';
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
  const [searchParams] = useSearchParams();
  const deptFilter = searchParams.get('dept');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const { tests, categories, loading, error } = usePublicCatalog();

  const deptCategories = useMemo(() => {
    if (!deptFilter) return null;
    const dept = SERVICE_DEPARTMENTS.find((d) => d.id === deptFilter);
    return dept?.categories ?? [];
  }, [deptFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((test) => {
      if (categoryId !== 'all' && String(test.category_id) !== categoryId) return false;
      if (deptCategories?.length && !deptCategories.includes(test.category_code)) return false;
      if (!q) return true;
      const hay = [test.name, test.name_ar, test.code, test.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [tests, query, categoryId, deptCategories]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((test) => {
      const key = test.category_id ?? 'other';
      if (!map.has(key)) {
        map.set(key, {
          name: isAr && test.category_name_ar ? test.category_name_ar : (test.category_name || (isAr ? 'أخرى' : 'Other')),
          tests: [],
        });
      }
      map.get(key).tests.push(test);
    });
    return [...map.values()];
  }, [filtered, isAr]);

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.testsTitle" descKey="site.meta.testsDesc" path="/tests" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.nav.tests')} title={t('site.meta.testsTitle')} subtitle={t('site.meta.testsDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container">
          <FadeUp>
            <div className="flex flex-col lg:flex-row gap-3 mb-8">
              <div className="relative flex-1">
                <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('site.testsPage.search')}
                  className="ps-10 h-11"
                  aria-label={t('site.testsPage.search')}
                />
              </div>
              <div className="relative lg:w-64">
                <Filter size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              {[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-24 w-full rounded-xl" />)}
            </div>
          )}

          {error && (
            <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 rounded-xl p-4 mb-6">
              {t('site.testsPage.error')}
            </p>
          )}

          {!loading && grouped.length === 0 && (
            <p className="text-center text-muted-foreground py-16">{t('site.testsPage.noResults')}</p>
          )}

          <div className="space-y-10">
            {grouped.map((group) => (
              <div key={group.name}>
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <FlaskConical size={18} className="text-primary-600" />
                  {group.name}
                  <span className="text-sm font-normal text-muted-foreground">({group.tests.length})</span>
                </h2>
                <div className="space-y-2">
                  {group.tests.map((test, i) => (
                    <FadeUp key={test.id} delay={Math.min(i * 0.02, 0.2)}>
                      <article className="site-test-row">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-foreground">
                                {isAr && test.name_ar ? test.name_ar : test.name}
                              </h3>
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" dir="ltr">
                                {test.code}
                              </span>
                            </div>
                            {test.description && (
                              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{test.description}</p>
                            )}
                          </div>
                          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs shrink-0">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock size={13} />
                              <dt className="sr-only">{t('site.testsPage.tat')}</dt>
                              <dd><span className="font-medium text-foreground">{t('site.testsPage.tat')}:</span> {formatTat(test.turnaround_hours, isAr)}</dd>
                            </div>
                            {test.requires_specimen && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <FlaskConical size={13} />
                                <dt className="sr-only">{t('site.testsPage.sample')}</dt>
                                <dd><span className="font-medium text-foreground">{t('site.testsPage.sample')}:</span> {test.requires_specimen}</dd>
                              </div>
                            )}
                            {test.method && (
                              <div className="text-muted-foreground">
                                <span className="font-medium text-foreground">{t('site.testsPage.method')}:</span> {test.method}
                              </div>
                            )}
                          </dl>
                        </div>
                      </article>
                    </FadeUp>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </PublicLayout>
  );
}
