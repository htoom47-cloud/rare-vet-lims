import { useTranslation } from 'react-i18next';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';

export default function FaqPage() {
  const { t } = useTranslation();
  const items = t('site.faq.items', { returnObjects: true });

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.faqTitle" descKey="site.meta.faqDesc" path="/faq" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.nav.faq')} title={t('site.meta.faqTitle')} subtitle={t('site.meta.faqDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container max-w-3xl space-y-3">
          {Array.isArray(items) && items.map(({ q, a }, i) => (
            <FadeUp key={q} delay={i * 0.04}>
              <details className="site-card group">
                <summary className="cursor-pointer list-none p-5 font-semibold text-foreground flex items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-primary-600 text-xl leading-none group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-5 pb-5 text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
                  {a}
                </div>
              </details>
            </FadeUp>
          ))}
        </div>
      </Section>
    </PublicLayout>
  );
}
