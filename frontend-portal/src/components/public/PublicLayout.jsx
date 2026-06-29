import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePortal } from '../../context/PortalContext';
import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';
import WhatsAppContact from '../portal/WhatsAppContact';

export default function PublicLayout({ children, redirectIfLoggedIn = false }) {
  const { customer, loading } = usePortal();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (redirectIfLoggedIn && !loading && customer) navigate('/dashboard', { replace: true });
  }, [redirectIfLoggedIn, loading, customer, navigate]);

  return (
    <div className="lab-home-page min-h-screen flex flex-col" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="lab-home-bg" aria-hidden>
        <img src="/images/lab-bg-texture.jpg" alt="" className="lab-home-bg__texture" loading="lazy" />
        <img src="/images/lab-hero-bg.jpg" alt="" className="lab-home-bg__hero" loading="lazy" />
        <div className="lab-home-bg__overlay" />
      </div>
      <PublicHeader />
      <main className="relative z-10 flex-1">{children}</main>
      <PublicFooter />
      <WhatsAppContact />
    </div>
  );
}
