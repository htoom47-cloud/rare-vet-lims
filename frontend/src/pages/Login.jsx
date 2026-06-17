import { useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';

import { useTheme } from '../context/ThemeContext';

import toast from 'react-hot-toast';

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

      toast.success('Welcome!');

      navigate('/');

    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message;
      if (!err.response) {
        toast.error(t('auth.serverUnreachable'));
      } else if (status === 429) {
        toast.error(t('auth.tooManyRequests'));
      } else if (status === 401) {
        toast.error(t('auth.loginFailed'));
      } else {
        toast.error(msg || t('auth.loginFailed'));
      }

    } finally {

      setLoading(false);

    }

  };



  return (

    <div className="min-h-screen flex items-center justify-center bg-primary-50 dark:bg-primary-900 p-3 sm:p-4 relative overflow-hidden">

      <div className="absolute top-0 end-0 w-48 h-48 bg-primary-400/20 rounded-bl-full" />

      <div className="absolute bottom-0 start-0 w-64 h-64 bg-primary-600/10 rounded-tr-full" />



      <div className="absolute top-4 end-4 flex gap-2 z-10">

        <button onClick={toggleLanguage} className="btn-secondary text-sm">{language === 'en' ? 'عربي' : 'EN'}</button>

        <button onClick={toggleTheme} className="btn-secondary text-sm">{theme === 'dark' ? '☀️' : '🌙'}</button>

      </div>



      <div className="w-full max-w-md relative z-10 px-1 sm:px-0">

        <div className="text-center mb-8">

          <AppLogo size="lg" className="mx-auto mb-4" />

          <h1 className="text-2xl font-bold text-primary-800 dark:text-primary-100">{t('app.name')}</h1>

          <p className="text-primary-400 font-medium mt-1">{t('app.subtitle')}</p>

          <div className="flex items-center justify-center gap-2 mt-3">

            <span className="h-px w-12 bg-primary-400" />

            <span className="text-primary-400 text-xs">◆</span>

            <span className="h-px w-12 bg-primary-400" />

          </div>

        </div>



        <div className="card border-primary-300/40 shadow-md p-4 sm:p-6">

          <h2 className="text-xl font-semibold mb-1 text-primary-800 dark:text-primary-100">{t('auth.welcome')}</h2>

          <p className="text-primary-600/70 dark:text-primary-300 text-sm mb-6">{t('auth.signIn')}</p>



          <form onSubmit={handleSubmit} className="space-y-4">

            <div>

              <label className="block text-sm font-medium mb-1 text-primary-700 dark:text-primary-200">{t('auth.username')}</label>

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

              <label className="block text-sm font-medium mb-1 text-primary-700 dark:text-primary-200">{t('auth.password')}</label>

              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">

              {loading ? t('common.loading') : t('auth.login')}

            </button>

          </form>

        </div>

      </div>

    </div>

  );

}


