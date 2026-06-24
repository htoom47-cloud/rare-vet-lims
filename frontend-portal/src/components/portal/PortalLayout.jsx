import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, FileText, PawPrint, GitCompare, FolderOpen, LogOut,
  Globe, Sun, Moon, Menu, Bell, Search,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { useTheme } from '../../context/ThemeContext';
import AppLogo from '../ui/AppLogo';
import { Button } from '../ui/button';
import PwaInstallBanner from './PwaInstallBanner';
import { portalSearchAPI } from '../../services/portalApi';

const navClass = ({ isActive }) =>
  `portal-nav-item ${isActive ? 'portal-nav-item-active' : ''}`;

export default function PortalLayout({ children, title, subtitle, alertCount = 0, wide = false, compact = false }) {
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
      <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-[#6B7280] pointer-events-none" />
      <input
        type="search"
        className="portal-search-input h-9 ps-9 text-sm w-full lg:w-64 rounded-xl outline-none focus:ring-2 focus:ring-[#2563EB]/40"
        placeholder={t('portal.searchPlaceholder')}
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        onFocus={() => searchResults && setSearchOpen(true)}
      />
      {searchOpen && searchResults && (
        <div className="absolute top-full mt-1 inset-x-0 lg:inset-x-auto lg:w-80 z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.2)] overflow-hidden">
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
                  <span className="font-mono font-medium">{a.animal_code}</span>
                  {a.name_tag && <span className="text-muted-foreground"> · {a.name_tag}</span>}
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
    <div className="flex flex-col h-full portal-sidebar text-[#9CA3AF]">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <AppLogo size="sm" variant="portal" />
          <div className="min-w-0 flex-1">
            <p className="portal-brand-title font-bold text-sm truncate leading-tight">{t('portal.title')}</p>
            <p className="portal-brand-sub text-[11px] truncate mt-0.5">{displayName}</p>
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
            className={navClass}
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-[#9CA3AF] hover:text-white hover:bg-white/10" onClick={toggleLanguage}>
          <Globe size={18} /> {isAr ? 'English' : 'العربية'}
        </Button>
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-[#9CA3AF] hover:text-white hover:bg-white/10" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? t('portal.lightMode') : t('portal.darkMode')}
        </Button>
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-[#EF4444] hover:text-[#FCA5A5] hover:bg-red-500/10" onClick={handleLogout}>
          <LogOut size={18} /> {t('portal.logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background portal-app flex" dir={isAr ? 'rtl' : 'ltr'}>
      <aside className="hidden lg:flex w-72 shrink-0 border-e border-white/10 portal-sidebar sticky top-0 h-screen">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-label="Close" />
          <aside className="relative w-80 max-w-[90vw] h-full portal-sidebar shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b portal-header">
          <div className="px-4 py-3 flex items-center justify-between gap-3 max-w-[90rem] mx-auto w-full">
            <Button type="button" variant="ghost" size="icon" className="lg:hidden shrink-0 text-[#E5E7EB] hover:bg-white/10" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </Button>
            <div className="min-w-0 flex-1 lg:hidden">
              <p className="portal-header-title font-semibold text-sm truncate">{title || t('portal.title')}</p>
            </div>
            <div className="hidden lg:flex items-center gap-4 flex-1">
              <div className="min-w-0">
                {title && <h1 className="portal-header-title text-lg font-bold truncate">{title}</h1>}
                {subtitle && <p className="text-xs text-[#9CA3AF] truncate">{subtitle}</p>}
              </div>
              <div className="ms-auto flex items-center gap-3">
                {searchBox}
                {alertCount > 0 && (
                  <button
                    type="button"
                    className="relative p-2 rounded-xl hover:bg-white/10 text-[#E5E7EB]"
                    onClick={() => navigate('/')}
                    aria-label={t('portal.notifications')}
                  >
                    <Bell size={20} />
                    <span className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-rose-500 text-[10px] text-white flex items-center justify-center font-bold">
                      {alertCount > 9 ? '9+' : alertCount}
                    </span>
                  </button>
                )}
              </div>
            </div>
            <div className="lg:hidden flex items-center gap-1">
              {alertCount > 0 && (
                <button type="button" className="relative p-2" onClick={() => navigate('/')}>
                  <Bell size={20} />
                  <span className="absolute top-0 end-0 w-2 h-2 rounded-full bg-rose-500" />
                </button>
              )}
            </div>
          </div>
          <div className="lg:hidden px-4 pb-3">{searchBox}</div>
        </header>

        <main className={`flex-1 w-full mx-auto px-3 sm:px-4 ${compact ? 'py-3 pb-20 lg:py-4 lg:pb-6' : 'py-6 pb-24 lg:pb-8'} ${wide ? 'max-w-[90rem]' : 'max-w-5xl'}`}>
          {(title || subtitle) && !compact && (
            <div className="hidden lg:block mb-6">
              {!title && <h1 className="text-2xl font-bold">{t('portal.title')}</h1>}
            </div>
          )}
          {children}
        </main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t portal-bottom-nav pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around px-1 py-1.5">
            {navItems.slice(0, 5).map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-medium min-w-[3.5rem] ${
                    isActive ? 'portal-nav-bottom-active' : 'portal-nav-bottom'
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
