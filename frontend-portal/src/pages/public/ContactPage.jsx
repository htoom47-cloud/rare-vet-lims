import { useTranslation } from 'react-i18next';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';
import ContactInfo from '../../components/public/ContactInfo';
import ContactInquiry from '../../components/public/ContactInquiry';

export default function ContactPage() {
  const { t } = useTranslation();

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.contactTitle" descKey="site.meta.contactDesc" path="/contact" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.nav.contact')} title={t('site.meta.contactTitle')} subtitle={t('site.meta.contactDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container grid lg:grid-cols-2 gap-6">
          <FadeUp><ContactInfo /></FadeUp>
          <FadeUp delay={0.08}><ContactInquiry /></FadeUp>
        </div>
      </Section>
    </PublicLayout>
  );
}
