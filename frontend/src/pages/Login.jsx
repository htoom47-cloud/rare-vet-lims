import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Globe } from 'lucide-react';
import { m } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppLogo from '../components/ui/AppLogo';
import PasswordInput from '../components/ui/PasswordInput';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { FadeIn } from '../components/motion/AnimatedPage';

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-app-mesh pointer-events-none" />
      <m.div
        className="absolute top-0 end-0 w-72 h-72 bg-primary-400/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"
        animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <m.div
        className="absolute bottom-0 start-0 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"
        animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="absolute top-4 end-4 flex gap-2 z-10">
        <Button type="button" variant="secondary" size="icon" onClick={toggleLanguage} className="bg-card/80 backdrop-blur">
          <Globe size={18} />
          <span className="sr-only">{language}</span>
        </Button>
        <Button type="button" variant="secondary" size="icon" onClick={toggleTheme} className="bg-card/80 backdrop-blur">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </Button>
      </div>

      <div className="w-full max-w-md relative z-10">
        <FadeIn className="text-center mb-8">
          <AppLogo size="lg" className="mx-auto mb-5 drop-shadow-sm" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('app.name')}</h1>
          <p className="text-muted-foreground font-medium mt-2 text-sm sm:text-base">{t('app.subtitle')}</p>
        </FadeIn>

        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <Card className="shadow-card-hover border-border/80 backdrop-blur-sm bg-card/95">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-xl">{t('auth.welcome')}</CardTitle>
              <CardDescription>{t('auth.signIn')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">{t('auth.username')}</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="font-mono"
                    placeholder={t('auth.usernamePlaceholder')}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading ? t('common.loading') : t('auth.login')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </m.div>

        <FadeIn delay={0.2}>
          <p className="text-center text-xs text-muted-foreground mt-6">{t('app.tagline')}</p>
        </FadeIn>
      </div>
    </div>
  );
}
