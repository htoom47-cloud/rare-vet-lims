import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, Globe, Sun, Moon, LogIn } from 'lucide-react';
import { useState } from 'react';
import LabBrandLockup from '../portal/LabBrandLockup';
import { Button } from '../ui/button';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';

const NAV = [
  { to: '/', labelKey: 'site.nav.home' },
  { to: '/services', labelKey: 'site.nav.services' },
  { to: '/tests', labelKey: 'site.nav.tests' },
  { to: '/equipment', labelKey: 'site.nav.equipment' },
  { to: '/quality', labelKey: 'site.nav.quality' },
  { to: '/faq', labelKey: 'site.nav.faq' },
  { to: '/contact', labelKey: 'site.nav.contact' },
];

export default function PublicHeader() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { theme, toggleTheme, toggleLanguage } = useTheme();
  const [open, setOpen] = useState(false);
  const isAr = i18n.language === 'ar';

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="site-container flex h-16 items-center justify-between gap-4">
        <Link to="/" className="shrink-0" onClick={() => setOpen(false)}>
          <LabBrandLockup compact embedded noDivider className="!w-auto max-w-[11rem] sm:max-w-[13rem]" />
        </Link>

        <nav className="hidden lg:flex items-center gap-1" aria-label={t('site.nav.main')}>
          {NAV.map(({ to, labelKey }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                pathname === to
                  ? 'text-primary-800 bg-primary-100/80 dark:text-primary-100 dark:bg-primary-900/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={toggleLanguage} aria-label={isAr ? 'English' : 'العربية'}>
            <Globe size={17} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 hidden sm:inline-flex" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex gap-1.5 h-9">
            <Link to="/login"><LogIn size={15} />{t('home.portalLogin')}</Link>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {open && (
        <nav className="lg:hidden border-t border-border/40 bg-background/95 px-4 py-3 space-y-1" aria-label={t('site.nav.mobile')}>
          {NAV.map(({ to, labelKey }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={cn(
                'block px-3 py-2.5 rounded-lg text-sm font-medium',
                pathname === to ? 'bg-primary-100/80 text-primary-900' : 'text-foreground hover:bg-muted',
              )}
            >
              {t(labelKey)}
            </Link>
          ))}
          <Link to="/login" onClick={() => setOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-primary-700">
            {t('home.portalLogin')}
          </Link>
        </nav>
      )}
    </header>
  );
}
