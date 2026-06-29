import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const SITE = 'https://portal.rarevetcare.com';

export default function PageMeta({ titleKey, descKey, path = '/' }) {
  const { t, i18n } = useTranslation();
  const title = t(titleKey);
  const desc = t(descKey);
  const url = `${SITE}${path}`;
  const locale = i18n.language === 'ar' ? 'ar_SA' : 'en_US';

  useEffect(() => {
    document.title = `${title} | ${t('portal.labName')}`;
    const setMeta = (name, content, prop = 'name') => {
      let el = document.querySelector(`meta[${prop}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(prop, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('description', desc);
    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:locale', locale, 'property');
    setMeta('og:type', 'website', 'property');
    setMeta('og:image', `${SITE}/images/lab-hero-bg.jpg`, 'property');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
  }, [title, desc, url, locale, t]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: t('portal.labName'),
    description: desc,
    url,
    medicalSpecialty: 'Veterinary',
    address: { '@type': 'PostalAddress', addressLocality: 'Al Muzahimiyah', addressCountry: 'SA' },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  );
}
