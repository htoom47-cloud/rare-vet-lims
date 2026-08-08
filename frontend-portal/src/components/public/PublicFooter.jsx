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
    <footer className="relative z-10 border-t-2 border-primary-800/20 bg-white dark:bg-[hsl(25_25%_12%)] mt-auto shadow-[0_-8px_30px_rgba(61,40,23,0.08)]">
      <div className="site-container py-12 grid gap-10 md:grid-cols-3">
        <div className="space-y-4">
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-xs" />
          <p className="text-sm text-primary-900 dark:text-primary-50 leading-relaxed max-w-sm font-medium">
            {t('site.footer.tagline')}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-bold text-primary-900 dark:text-primary-50 mb-3">
            {t('site.footer.explore')}
          </h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {FOOTER_LINKS.map(({ to, key }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="text-primary-800 dark:text-primary-100 hover:text-primary-600 dark:hover:text-white font-medium transition-colors"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold text-primary-900 dark:text-primary-50 mb-3">
            {t('site.footer.contact')}
          </h3>
          <ul className="text-sm text-primary-900 dark:text-primary-50 space-y-2 font-medium">
            <li dir="ltr">0115007257</li>
            <li>alnwader.10hz@gmail.com</li>
            <li>{t('home.address')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-800/15 bg-primary-50/80 dark:bg-primary-950/40 py-6">
        <div className="site-container flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-semibold text-primary-900 dark:text-primary-50">
            © {new Date().getFullYear()} {t('portal.labName')} — {t('site.footer.rights')}
          </p>
          <div
            className="inline-flex items-center justify-center rounded-2xl bg-primary-800 dark:bg-primary-200 px-6 py-3 shadow-md"
            dir="ltr"
          >
            <p className="text-sm sm:text-base font-bold tracking-wide text-primary-50 dark:text-primary-950">
              {t('site.footer.credit')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
