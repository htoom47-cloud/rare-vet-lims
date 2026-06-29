import { useTranslation } from 'react-i18next';
import { FadeUp } from './Section';

export default function WorkflowTimeline({ steps }) {
  const { t } = useTranslation();

  return (
    <div className="site-timeline">
      {steps.map((key, i) => (
        <FadeUp key={key} delay={i * 0.06} className="site-timeline__item">
          <div className="site-timeline__marker">
            <span className="site-timeline__dot">{i + 1}</span>
            {i < steps.length - 1 && <span className="site-timeline__line" aria-hidden />}
          </div>
          <div className="site-timeline__content">
            <h3 className="font-semibold text-foreground">{t(`site.workflow.${key}.title`)}</h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{t(`site.workflow.${key}.desc`)}</p>
          </div>
        </FadeUp>
      ))}
    </div>
  );
}
