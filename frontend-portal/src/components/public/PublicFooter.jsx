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
    <footer className="border-t border-border/60 bg-card/50 mt-auto">
      <div className="site-container py-12 grid gap-10 md:grid-cols-3">
        <div className="space-y-4">
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-xs" />
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">{t('site.footer.tagline')}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('site.footer.explore')}</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {FOOTER_LINKS.map(({ to, key }) => (
              <li key={to}><Link to={to} className="text-muted-foreground hover:text-primary-700 transition-colors">{t(key)}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('site.footer.contact')}</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li dir="ltr">0115007257</li>
            <li>alnwader.10hz@gmail.com</li>
            <li>{t('home.address')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/40 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {t('portal.labName')} — {t('site.footer.rights')}
      </div>
    </footer>
  );
}
