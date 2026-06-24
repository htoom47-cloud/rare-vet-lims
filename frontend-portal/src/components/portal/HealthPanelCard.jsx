import {
  Activity, Beaker, Bug, Dna, FlaskConical, HeartPulse, Baby,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import StatusBadge, { StatusDot } from './StatusBadge';
import { cn } from '../../lib/utils';

const PANEL_ICONS = {
  cbc: Activity,
  chem: FlaskConical,
  hormones: Beaker,
  infectious: Dna,
  parasitology: Bug,
  reproduction: Baby,
};

export default function HealthPanelCard({ panel, onClick, className }) {
  const { t } = useTranslation();
  const Icon = PANEL_ICONS[panel.key] || HeartPulse;
  const status = panel.status || 'none';

  return (
    <Card
      className={cn(
        'portal-health-card overflow-hidden transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5',
        status === 'abnormal' && 'portal-health-card-alert',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          status === 'normal' && 'bg-emerald-500/10 text-emerald-600',
          status === 'attention' && 'bg-amber-500/10 text-amber-600',
          status === 'abnormal' && 'bg-rose-500/10 text-rose-600',
          status === 'none' && 'bg-muted text-muted-foreground',
        )}
        >
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{t(`portal.panels.${panel.key}`)}</p>
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
        </div>
        <StatusDot status={status} className="mt-1" />
      </CardContent>
    </Card>
  );
}
