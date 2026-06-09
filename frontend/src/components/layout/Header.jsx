import { useTranslation } from 'react-i18next';
import { Menu, Sun, Moon, Globe, LogOut, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNavigate } from 'react-router-dom';

export default function Header({ onMenuClick, sidebarCollapsed }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme, toggleLanguage, language } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-primary-50/90 dark:bg-primary-900/90 backdrop-blur border-b border-primary-200 dark:border-primary-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="p-2 hover:bg-primary-100 dark:hover:bg-primary-800 rounded-lg lg:hidden text-primary-700">
            <Menu size={20} />
          </button>
          <h2 className="text-lg font-semibold hidden sm:block text-primary-400">
            {t('app.subtitle')}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggleLanguage} className="p-2 hover:bg-primary-100 dark:hover:bg-primary-800 rounded-lg text-primary-700" title="Toggle language">
            <Globe size={18} />
            <span className="sr-only">{language}</span>
          </button>
          <button onClick={toggleTheme} className="p-2 hover:bg-primary-100 dark:hover:bg-primary-800 rounded-lg text-primary-700">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="p-2 hover:bg-primary-100 dark:hover:bg-primary-800 rounded-lg relative text-primary-700">
            <Bell size={18} />
          </button>
          <div className="hidden sm:flex items-center gap-2 ms-2 ps-2 border-s border-primary-200 dark:border-primary-700">
            <div className="w-8 h-8 bg-primary-100 dark:bg-primary-800 rounded-full flex items-center justify-center text-primary-700 dark:text-primary-300 text-sm font-medium border border-primary-300">
              {user?.full_name?.charAt(0)}
            </div>
            <div className="text-sm">
              <p className="font-medium">{user?.full_name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 rounded-lg" title={t('nav.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
