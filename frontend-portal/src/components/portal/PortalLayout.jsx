import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, FileText, PawPrint, GitCompare, FolderOpen, LogOut,
  Globe, Sun, Moon, Menu, Search, Receipt,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { useTheme } from '../../context/ThemeContext';
import LabBrandLockup from './LabBrandLockup';
import PortalNotifications from './PortalNotifications';
import { Button } from '../ui/button';
import PwaInstallBanner from './PwaInstallBanner';
import { portalSearchAPI } from '../../services/portalApi';
import { cn } from '../../lib/utils';

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
    isActive
      ? 'bg-primary-600 text-white shadow-sm'
      : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800/70'
  }`;

const isMonoSubtitle = (value) => /^[A-Z]{2,5}-\d/.test(String(value || ''));

export default function PortalLayout({ children, title, subtitle, wide = false, compact = false }) {
  const { t, i18n } = useTranslation();
  const { customer, logout } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const isAr = i18n.language === 'ar';
  const displayName = isAr ? (customer?.full_name_ar || customer?.full_name) : customer?.full_name;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('portal.navDashboard'), end: true },
    { to: '/animals', icon: PawPrint, label: t('portal.navAnimals') },
    { to: '/reports', icon: FileText, label: t('portal.navReports') },
    { to: '/invoices', icon: Receipt, label: t('portal.navInvoices') },
    { to: '/compare', icon: GitCompare, label: t('portal.navCompare') },
    { to: '/documents', icon: FolderOpen, label: t('portal.navDocuments') },
  ];

  const runSearch = useCallback(async (q) => {
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    try {
      const { data } = await portalSearchAPI.search(q);
      setSearchResults(data.data);
      setSearchOpen(true);
    } catch {
      setSearchResults(null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(searchQ), 300);
    return () => clearTimeout(timer);
  }, [searchQ, runSearch]);

  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const searchBox = (
    <div className="relative" ref={searchRef}>
      <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        className="input-field h-9 ps-9 text-sm w-full lg:w-64"
        placeholder={t('portal.searchPlaceholder')}
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        onFocus={() => searchResults && setSearchOpen(true)}
      />
      {searchOpen && searchResults && (
        <div className="absolute top-full mt-1 inset-x-0 lg:inset-x-auto lg:w-80 z-50 bg-card border border-border rounded-xl shadow-card-hover overflow-hidden">
          {searchResults.animals?.length > 0 && (
            <div className="p-2 border-b border-border">
              <p className="text-[10px] uppercase text-muted-foreground px-2 py-1">{t('portal.navAnimals')}</p>
              {searchResults.animals.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="w-full text-start px-3 py-2 rounded-lg hover:bg-accent text-sm"
                  onClick={() => { navigate(`/animals/${a.id}`); setSearchOpen(false); setSearchQ(''); }}
                >
                  <span className="font-medium">{a.name_tag || a.animal_code}</span>
                  {a.name_tag && <span className="text-muted-foreground font-mono text-xs"> · {a.animal_code}</span>}
                </button>
              ))}
            </div>
          )}
          {searchResults.reports?.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] uppercase text-muted-foreground px-2 py-1">{t('portal.navReports')}</p>
              {searchResults.reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-start px-3 py-2 rounded-lg hover:bg-accent text-sm"
                  onClick={() => { navigate(`/reports/${r.id}`); setSearchOpen(false); setSearchQ(''); }}
                >
                  <span className="font-mono">{r.report_number}</span>
                </button>
              ))}
            </div>
          )}
          {!searchResults.animals?.length && !searchResults.reports?.length && (
            <p className="text-sm text-muted-foreground p-4 text-center">{t('portal.noSearchResults')}</p>
          )}
        </div>
      )}
    </div>
  );

  const sidebar = (
    <div className="flex flex-col h-full bg-card">
      <div className="portal-sidebar-brand">
        <LabBrandLockup embedded />
        <div className="px-4 pb-4 pt-1">
          <div className="portal-sidebar-user-card">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-500 dark:text-primary-400">
              {t('portal.title')}
            </p>
            <p className="text-sm font-semibold text-foreground truncate mt-1">{displayName}</p>
          </div>
        </div>
      </div>

      <div className="p-3 hidden lg:block">{searchBox}</div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={navLinkClass}
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-primary-200/80 dark:border-primary-700 space-y-1">
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800/70" onClick={toggleLanguage}>
          <Globe size={18} /> {isAr ? 'English' : 'العربية'}
        </Button>
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800/70" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? t('portal.lightMode') : t('portal.darkMode')}
        </Button>
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={handleLogout}>
          <LogOut size={18} /> {t('portal.logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background bg-app-mesh flex" dir={isAr ? 'rtl' : 'ltr'}>
      <aside className="hidden lg:flex w-72 shrink-0 bg-card border-e border-border/80 sticky top-0 h-screen shadow-lg lg:shadow-none">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-label="Close" />
          <aside className="relative w-80 max-w-[90vw] h-full bg-card shadow-xl border-e border-border/80">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/80 shadow-header bg-card/90 backdrop-blur-md lg:bg-gradient-to-b lg:from-primary-50/80 lg:to-card/95 lg:dark:from-[hsl(25_22%_16%)] lg:dark:to-card/95">
          <div className="px-4 py-3 flex items-center justify-between gap-3 max-w-[90rem] mx-auto w-full">
            <Button type="button" variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </Button>
            <div className="min-w-0 flex-1 lg:hidden">
              {isAr && !title && (
                <LabBrandLockup compact embedded className="!w-auto max-w-[13.5rem] ms-auto rounded-lg overflow-hidden" />
              )}
              {isAr && title && (
                <div className="text-end min-w-0">
                  <p className="font-semibold text-sm truncate text-foreground">{title}</p>
                  {subtitle && (
                    <p className="text-[10px] font-mono text-muted-foreground truncate">{subtitle}</p>
                  )}
                </div>
              )}
              {!isAr && (
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate text-foreground">{title || t('portal.title')}</p>
                  {subtitle && (
                    <p className={cn(
                      'text-[10px] truncate',
                      isMonoSubtitle(subtitle) ? 'font-mono text-muted-foreground' : 'text-muted-foreground'
                    )}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="hidden lg:flex items-center gap-4 flex-1 min-w-0">
              <div className="min-w-0 flex-1">
                {title && (
                  <h1 className="text-lg font-bold truncate text-foreground leading-tight">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className={cn(
                    'text-xs truncate mt-0.5',
                    isMonoSubtitle(subtitle) ? 'font-mono text-muted-foreground' : 'text-muted-foreground'
                  )}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {!isAr && (
                  <LabBrandLockup
                    compact
                    embedded
                    noDivider
                    className="!w-auto max-w-[15rem] shrink-0 hidden xl:block"
                  />
                )}
                {searchBox}
                <PortalNotifications />
              </div>
            </div>
            <div className="lg:hidden flex items-center gap-1">
              <PortalNotifications />
            </div>
          </div>
          <div className="lg:hidden px-4 pb-3">{searchBox}</div>
        </header>

        <main className={`flex-1 w-full mx-auto px-3 sm:px-4 ${compact ? 'py-3 pb-20 lg:py-4 lg:pb-6' : 'py-6 pb-24 lg:pb-8'} ${wide ? 'max-w-[90rem]' : 'max-w-5xl'}`}>
          {(title || subtitle) && !compact && (
            <div className="hidden lg:block mb-6">
              {!title && <h1 className="text-2xl font-bold text-foreground">{t('portal.title')}</h1>}
            </div>
          )}
          {children}
        </main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border/80 bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around px-1 py-1.5">
            {navItems.slice(0, 6).map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-medium min-w-[3.5rem] ${
                    isActive ? 'text-primary-600' : 'text-muted-foreground'
                  }`
                }
              >
                <Icon size={18} />
                <span className="truncate max-w-[4rem]">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <PwaInstallBanner />
    </div>
  );
}
