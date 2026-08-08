import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LabBrandLockup from '../portal/LabBrandLockup';

const FOOTER_LINKS = [
  { to: '/services', key: 'site.nav.services' },
  { to: '/tests', key: 'site.nav.tests' },
  { to: '/equipment', key: 'site.nav.equipment' },
  { to: '/articles', key: 'site.nav.articles' },
  { to: '/news', key: 'site.nav.news' },
  { to: '/partners', key: 'site.nav.partners' },
  { to: '/careers', key: 'site.nav.careers' },
  { to: '/privacy', key: 'site.nav.privacy' },
  { to: '/terms', key: 'site.nav.terms' },
];

export default function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="site-container py-12 grid gap-10 md:grid-cols-3">
        <div className="space-y-4">
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-xs" />
          <p className="text-sm text-foreground/85 leading-relaxed max-w-sm">{t('site.footer.tagline')}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('site.footer.explore')}</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {FOOTER_LINKS.map(({ to, key }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="text-foreground/80 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('site.footer.contact')}</h3>
          <ul className="text-sm text-foreground/85 space-y-2">
            <li dir="ltr">0115007257</li>
            <li>alnwader.10hz@gmail.com</li>
            <li>{t('home.address')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-6">
        <div className="site-container flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-foreground/90">
            © {new Date().getFullYear()} {t('portal.labName')} — {t('site.footer.rights')}
          </p>
          <div
            className="inline-flex items-center justify-center rounded-xl border border-primary-500/40 bg-primary-600/15 dark:bg-primary-500/20 px-5 py-2.5 shadow-sm"
            dir="ltr"
          >
            <p className="text-sm sm:text-base font-semibold text-foreground tracking-wide">
              {t('site.footer.credit')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
