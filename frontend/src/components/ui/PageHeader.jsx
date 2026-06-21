import { Badge } from './badge';
import { FadeIn } from '../motion/AnimatedPage';

export default function PageHeader({ title, subtitle, action, badge }) {
  return (
    <FadeIn className="page-header">
      <div className="min-w-0 flex-1">
        {badge && <Badge variant="gold" className="mb-2">{badge}</Badge>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </FadeIn>
  );
}
