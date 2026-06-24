import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText, PawPrint, GitCompare, LogOut, Globe, Sun, Moon, Menu, X,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { useTheme } from '../../context/ThemeContext';
import AppLogo from '../ui/AppLogo';
import { Button } from '../ui/button';
import PwaInstallBanner from './PwaInstallBanner';

const navClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
  }`;

export default function PortalLayout({ children, title, subtitle }) {
  const { t, i18n } = useTranslation();
  const { customer, logout } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAr = i18n.language === 'ar';
  const displayName = isAr ? (customer?.full_name_ar || customer?.full_name) : customer?.full_name;

  const navItems = [
    { to: '/reports', icon: FileText, label: t('portal.navReports') },
    { to: '/animals', icon: PawPrint, label: t('portal.navAnimals') },
    { to: '/compare', icon: GitCompare, label: t('portal.navCompare') },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <AppLogo size="sm" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{t('portal.title')}</p>
            <p className="text-xs text-muted-foreground truncate">{displayName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={navClass}
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border/60 space-y-1">
        <Button type="button" variant="ghost" className="w-full justify-start gap-3" onClick={toggleLanguage}>
          <Globe size={18} /> {isAr ? 'English' : 'العربية'}
        </Button>
        <Button type="button" variant="ghost" className="w-full justify-start gap-3" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? t('portal.lightMode') : t('portal.darkMode')}
        </Button>
        <Button type="button" variant="ghost" className="w-full justify-start gap-3 text-destructive" onClick={handleLogout}>
          <LogOut size={18} /> {t('portal.logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background bg-app-mesh flex" dir={isAr ? 'rtl' : 'ltr'}>
      <aside className="hidden lg:flex w-64 shrink-0 border-e border-border/60 bg-card/80 backdrop-blur-md sticky top-0 h-screen">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-label="Close" />
          <aside className="relative w-72 max-w-[85vw] h-full bg-card shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-card/90 backdrop-blur-md lg:hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </Button>
            <div className="text-center min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{title || t('portal.title')}</p>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setMenuOpen(false)} className="opacity-0 pointer-events-none">
              <X size={20} />
            </Button>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-24 lg:pb-6">
          {(title || subtitle) && (
            <div className="hidden lg:block mb-6">
              {title && <h1 className="text-2xl font-bold">{title}</h1>}
              {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            </div>
          )}
          {children}
        </main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border/60 bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around px-2 py-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium min-w-[4.5rem] ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`
                }
              >
                <Icon size={20} />
                <span className="truncate max-w-[5rem]">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <PwaInstallBanner />
    </div>
  );
}
