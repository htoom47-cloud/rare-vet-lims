import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppLogo from '../components/ui/AppLogo';
import PasswordInput from '../components/ui/PasswordInput';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { language, toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      toast.success(t('auth.loginSuccess'));
      navigate('/');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message;
      if (!err.response) toast.error(t('auth.serverUnreachable'));
      else if (status === 429) toast.error(t('auth.tooManyRequests'));
      else if (status === 401) toast.error(t('auth.loginFailed'));
      else toast.error(msg || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-primary-900 p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-app-mesh pointer-events-none" />
      <div className="absolute top-0 end-0 w-72 h-72 bg-primary-400/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 start-0 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

      <div className="absolute top-4 end-4 flex gap-2 z-10">
        <button type="button" onClick={toggleLanguage} className="icon-btn bg-white/80 dark:bg-primary-800/80 backdrop-blur shadow-sm">
          <Globe size={18} />
          <span className="sr-only">{language}</span>
        </button>
        <button type="button" onClick={toggleTheme} className="icon-btn bg-white/80 dark:bg-primary-800/80 backdrop-blur shadow-sm">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <AppLogo size="lg" className="mx-auto mb-5 drop-shadow-sm" />
          <h1 className="text-2xl sm:text-3xl font-bold text-primary-800 dark:text-primary-100">{t('app.name')}</h1>
          <p className="text-primary-500 font-medium mt-2 text-sm sm:text-base">{t('app.subtitle')}</p>
        </div>

        <div className="card shadow-card-hover border-primary-200/80 dark:border-primary-700/80 backdrop-blur-sm bg-white/95 dark:bg-primary-800/95">
          <div className="mb-6 pb-4 border-b border-primary-100 dark:border-primary-700">
            <h2 className="text-xl font-semibold text-primary-800 dark:text-primary-100">{t('auth.welcome')}</h2>
            <p className="text-primary-500 text-sm mt-1">{t('auth.signIn')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-primary-700 dark:text-primary-200">{t('auth.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field font-mono"
                placeholder={t('auth.usernamePlaceholder')}
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-primary-700 dark:text-primary-200">{t('auth.password')}</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? t('common.loading') : t('auth.login')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-primary-400 mt-6">{t('app.tagline')}</p>
      </div>
    </div>
  );
}
