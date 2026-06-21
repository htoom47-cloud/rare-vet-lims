import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Menu, Sun, Moon, Globe, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { isReception } from '../../utils/roles';
import { routeTitleKey } from '../../utils/routeTitles';

export default function Header({ onMenuClick }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme, toggleLanguage, language } = useTheme();
  const navigate = useNavigate();

  const pageTitle = t(routeTitleKey(pathname, isReception(user)));
  const roleKey = user?.role ? `permissions.roles.${user.role}` : '';
  const roleLabel = roleKey ? t(roleKey, { defaultValue: user?.role?.replace(/_/g, ' ') }) : '';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-white/85 dark:bg-primary-900/90 backdrop-blur-md border-b border-primary-200/80 dark:border-primary-700 shadow-header px-3 sm:px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onMenuClick} className="icon-btn lg:hidden shrink-0">
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-primary-800 dark:text-primary-100 truncate">
              {pageTitle}
            </h2>
            <p className="text-xs text-primary-400 hidden sm:block truncate">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button type="button" onClick={toggleLanguage} className="icon-btn" title={language === 'en' ? 'العربية' : 'English'}>
            <Globe size={18} />
          </button>
          <button type="button" onClick={toggleTheme} className="icon-btn">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="hidden md:flex items-center gap-2.5 ms-1 ps-3 border-s border-primary-200 dark:border-primary-700">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm">
              {user?.full_name?.charAt(0)}
            </div>
            <div className="text-sm min-w-0">
              <p className="font-medium text-primary-800 dark:text-primary-100 truncate max-w-[140px]">{user?.full_name}</p>
              <p className="text-[11px] text-primary-400 truncate">{roleLabel}</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="icon-btn text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ms-1" title={t('nav.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
