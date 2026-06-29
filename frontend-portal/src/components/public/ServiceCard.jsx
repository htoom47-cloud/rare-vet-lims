import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { COLOR_RING } from '../../data/siteStructure';

export default function ServiceCard({
  id, icon: Icon, color, image, compact = false, testCount = 0,
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  return (
    <article className={`site-service-card ${compact ? 'site-service-card--compact' : ''}`}>
      {image && (
        <div className="site-service-card__media">
          <img src={image} alt="" loading="lazy" />
          <div className="site-service-card__media-shade" />
          <div className={`site-service-card__icon ring-1 ${COLOR_RING[color]}`}>
            <Icon size={22} strokeWidth={1.75} />
          </div>
        </div>
      )}
      <div className="site-service-card__body">
        {!image && (
          <div className={`site-service-card__icon-inline ring-1 ${COLOR_RING[color]}`}>
            <Icon size={24} strokeWidth={1.75} />
          </div>
        )}
        <h3 className="site-service-card__title">{t(`site.departments.${id}.title`)}</h3>
        <p className="site-service-card__desc">{t(`site.departments.${id}.desc`)}</p>
        {!compact && (
          <p className="site-service-card__benefit">{t(`site.departments.${id}.benefit`)}</p>
        )}
        <div className="site-service-card__actions">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to={`/services#${id}`}>
              {t('site.common.learnMore')}
              <ChevronRight size={14} className={isAr ? 'rotate-180' : ''} />
            </Link>
          </Button>
          {testCount > 0 && (
            <Button asChild variant="ghost" size="sm" className="gap-1 text-primary-700">
              <Link to={`/tests?dept=${id}`}>
                {t('site.common.viewTests')}
                <ChevronRight size={14} className={isAr ? 'rotate-180' : ''} />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
