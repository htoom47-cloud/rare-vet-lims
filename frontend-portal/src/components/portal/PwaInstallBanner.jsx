import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share, X } from 'lucide-react';
import { Button } from '../ui/button';

const DISMISS_KEY = 'portal_pwa_install_dismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    if (isStandalone() || dismissed) return undefined;

    if (isIos()) {
      setShowIosHint(true);
      return undefined;
    }

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [dismissed]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (dismissed || isStandalone()) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-border/80 bg-card/95 backdrop-blur shadow-card-hover p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            {showIosHint ? <Share size={20} /> : <Download size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">{t('portal.pwaTitle')}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {showIosHint ? t('portal.pwaIosHint') : t('portal.pwaAndroidHint')}
            </p>
            {!showIosHint && (
              <Button type="button" size="sm" className="mt-3 w-full" onClick={install}>
                {t('portal.pwaInstall')}
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground p-1"
            aria-label={t('portal.pwaDismiss')}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
