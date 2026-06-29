import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, FadeUp } from '../../components/public/Section';
import { Button } from '../../components/ui/button';

const PAGE_CONFIG = {
  articles: { titleKey: 'site.nav.articles', descKey: 'site.legal.articlesEmpty', bodyKey: 'site.legal.articlesEmpty', path: '/articles' },
  news: { titleKey: 'site.nav.news', descKey: 'site.legal.newsEmpty', bodyKey: 'site.legal.newsEmpty', path: '/news' },
  partners: { titleKey: 'site.nav.partners', descKey: 'site.legal.partnersEmpty', bodyKey: 'site.legal.partnersEmpty', path: '/partners' },
  careers: { titleKey: 'site.nav.careers', descKey: 'site.legal.careersEmpty', bodyKey: 'site.legal.careersEmpty', path: '/careers' },
  privacy: { titleKey: 'site.legal.privacyTitle', descKey: 'site.legal.privacyBody', bodyKey: 'site.legal.privacyBody', path: '/privacy' },
  terms: { titleKey: 'site.legal.termsTitle', descKey: 'site.legal.termsBody', bodyKey: 'site.legal.termsBody', path: '/terms' },
};

export default function ContentPage({ page = 'articles' }) {
  const { t } = useTranslation();
  const cfg = PAGE_CONFIG[page] || PAGE_CONFIG.articles;

  return (
    <PublicLayout>
      <PageMeta titleKey={cfg.titleKey} descKey={cfg.descKey} path={cfg.path} />

      <Section>
        <div className="site-container">
          <FadeUp>
            <article className="site-prose max-w-3xl">
              <h1>{t(cfg.titleKey)}</h1>
              <p>{t(cfg.bodyKey)}</p>
              {(page === 'careers' || page === 'articles') && (
                <Button asChild className="mt-6">
                  <Link to="/contact">{t('site.nav.contact')}</Link>
                </Button>
              )}
            </article>
          </FadeUp>
        </div>
      </Section>
    </PublicLayout>
  );
}
