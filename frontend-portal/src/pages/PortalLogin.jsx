import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Globe, Smartphone, ShieldCheck } from 'lucide-react';
import { m } from 'framer-motion';
import toast from 'react-hot-toast';
import { usePortal } from '../context/PortalContext';
import { useTheme } from '../context/ThemeContext';
import AppLogo from '../components/ui/AppLogo';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { FadeIn } from '../components/motion/AnimatedPage';

export default function PortalLogin() {
  const { t } = useTranslation();
  const { requestOtp, verifyOtp } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('mobile');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await requestOtp(mobile);
      setStep('otp');
      toast.success(t('portal.otpSent'));
      if (result.debugOtp) {
        toast(`Dev OTP: ${result.debugOtp}`, { duration: 15000, icon: '🔑' });
      }
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.error?.code;
      if (status === 404 || code === 'CUSTOMER_NOT_FOUND') {
        toast.error(t('portal.mobileNotFound'));
      } else if (status === 429) {
        toast.error(t('portal.otpCooldown'));
      } else {
        toast.error(err.response?.data?.error?.message || t('portal.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(mobile, otp);
      toast.success(t('portal.loginSuccess'));
      navigate('/reports');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('portal.invalidOtp'));
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

      <div className="absolute top-4 end-4 flex gap-2 z-10">
        <Button type="button" variant="secondary" size="icon" onClick={toggleLanguage} className="bg-card/80 backdrop-blur">
          <Globe size={18} />
        </Button>
        <Button type="button" variant="secondary" size="icon" onClick={toggleTheme} className="bg-card/80 backdrop-blur">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </Button>
      </div>

      <div className="w-full max-w-md relative z-10">
        <FadeIn className="text-center mb-8">
          <AppLogo size="lg" className="mx-auto mb-5 drop-shadow-sm" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('portal.title')}</h1>
          <p className="text-muted-foreground font-medium mt-2 text-sm sm:text-base">{t('portal.subtitle')}</p>
        </FadeIn>

        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.08 }}
        >
          <Card className="shadow-card-hover border-border/80 backdrop-blur-sm bg-card/95">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary" />
                {step === 'mobile' ? t('portal.signIn') : t('portal.enterOtp')}
              </CardTitle>
              <CardDescription>
                {step === 'mobile' ? t('portal.mobileHint') : t('portal.otpHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {step === 'mobile' ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mobile">{t('customers.mobile')}</Label>
                    <div className="relative">
                      <Smartphone size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="mobile"
                        type="tel"
                        dir="ltr"
                        className="ps-9"
                        placeholder="05XXXXXXXX"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t('common.loading') : t('portal.sendOtp')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">{t('portal.otpCode')}</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      dir="ltr"
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                    {loading ? t('common.loading') : t('portal.verifyAndLogin')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-sm"
                    onClick={() => { setStep('mobile'); setOtp(''); }}
                  >
                    {t('portal.changeMobile')}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </m.div>
      </div>
    </div>
  );
}
