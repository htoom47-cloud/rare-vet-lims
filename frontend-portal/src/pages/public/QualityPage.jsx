import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Award, FileCheck, Microscope } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';
import { QUALITY_PILLARS } from '../../data/siteStructure';
import { Button } from '../../components/ui/button';

const ICONS = { standards: Shield, biosafety: Microscope, accreditation: Award, procedures: FileCheck };

export default function QualityPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.qualityTitle" descKey="site.meta.qualityDesc" path="/quality" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.quality.eyebrow')} title={t('site.quality.title')} subtitle={t('site.meta.qualityDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container">
          <div className="grid sm:grid-cols-2 gap-5 mb-12">
            {QUALITY_PILLARS.map((key, i) => {
              const Icon = ICONS[key];
              return (
                <FadeUp key={key} delay={i * 0.05}>
                  <article className="site-card p-6 sm:p-8 h-full">
                    <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mb-4">
                      <Icon size={24} className="text-primary-700 dark:text-primary-300" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{t(`site.quality.${key}.title`)}</h2>
                    <p className="text-muted-foreground mt-3 leading-relaxed">{t(`site.quality.${key}.desc`)}</p>
                  </article>
                </FadeUp>
              );
            })}
          </div>

          <FadeUp>
            <div className="site-card p-8 text-center max-w-2xl mx-auto">
              <h2 className="text-lg font-bold mb-2">{isAr ? 'التزامنا بالجودة' : 'Our quality commitment'}</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {isAr
                  ? 'نعمل وفق إجراءات تشغيلية موثقة وسلامة حيوية صارمة، مع مسار واضح نحو الاعتمادات الدولية في المختبرات البيطرية.'
                  : 'We operate under documented SOPs and strict biosafety, with a clear path toward international veterinary laboratory accreditation.'}
              </p>
              <Button asChild>
                <Link to="/contact">{isAr ? 'تواصل مع فريق الجودة' : 'Contact our quality team'}</Link>
              </Button>
            </div>
          </FadeUp>
        </div>
      </Section>
    </PublicLayout>
  );
}
