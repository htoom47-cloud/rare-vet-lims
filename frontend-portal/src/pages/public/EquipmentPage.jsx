import { useTranslation } from 'react-i18next';
import { Cpu, CheckCircle2 } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import PageMeta from '../../components/public/PageMeta';
import { Section, SectionHeader, FadeUp } from '../../components/public/Section';
import { EQUIPMENT } from '../../data/siteStructure';

export default function EquipmentPage() {
  const { t } = useTranslation();

  return (
    <PublicLayout>
      <PageMeta titleKey="site.meta.equipmentTitle" descKey="site.meta.equipmentDesc" path="/equipment" />

      <div className="site-page-hero site-container">
        <SectionHeader eyebrow={t('site.equipment.eyebrow')} title={t('site.equipment.title')} subtitle={t('site.meta.equipmentDesc')} />
      </div>

      <Section className="!pt-0">
        <div className="site-container grid md:grid-cols-2 gap-6">
          {EQUIPMENT.map(({ id, image }, i) => (
            <FadeUp key={id} delay={i * 0.05}>
              <article className="site-card overflow-hidden h-full flex flex-col">
                <div className="aspect-[16/10] relative overflow-hidden bg-muted">
                  <img
                    src={image}
                    alt={t(`site.equipment.${id}.name`)}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col gap-4">
                  <h2 className="text-xl font-bold text-foreground">{t(`site.equipment.${id}.name`)}</h2>
                  <dl className="space-y-3 text-sm">
                    <div className="flex gap-2">
                      <dt className="font-semibold text-foreground shrink-0">{t('site.nav.services')}:</dt>
                      <dd className="text-muted-foreground">{t(`site.equipment.${id}.use`)}</dd>
                    </div>
                    <div className="flex gap-2 items-start">
                      <Cpu size={16} className="text-primary-600 shrink-0 mt-0.5" />
                      <div>
                        <dt className="font-semibold text-foreground">{t('site.testsPage.method')}</dt>
                        <dd className="text-muted-foreground">{t(`site.equipment.${id}.tech`)}</dd>
                      </div>
                    </div>
                    <div className="flex gap-2 items-start">
                      <CheckCircle2 size={16} className="text-primary-600 shrink-0 mt-0.5" />
                      <div>
                        <dt className="font-semibold text-foreground">{t('site.whyUs.equipment.title')}</dt>
                        <dd className="text-muted-foreground">{t(`site.equipment.${id}.features`)}</dd>
                      </div>
                    </div>
                  </dl>
                </div>
              </article>
            </FadeUp>
          ))}
        </div>
      </Section>
    </PublicLayout>
  );
}
