import { m } from 'framer-motion';
import { Card } from './card';
import { cn } from '../../lib/utils';

export default function StatCard({ title, value, icon: Icon, color = 'primary', subtitle }) {
  const colors = {
    primary: 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground',
    gold: 'bg-primary-100 text-primary-500 dark:bg-primary-800 dark:text-primary-300',
    green: 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-400',
    red: 'bg-red-50 dark:bg-red-900/25 text-red-600 dark:text-red-400',
    blue: 'bg-sky-50 dark:bg-sky-900/25 text-sky-700 dark:text-sky-400',
    orange: 'bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-400',
  };

  return (
    <m.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.995 }}
    >
      <Card className="flex items-start gap-4 hover:shadow-card-hover">
        {Icon && (
          <div className={cn('p-3 rounded-xl shrink-0 transition-colors', colors[color])}>
            <Icon size={22} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-0.5 text-foreground tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </Card>
    </m.div>
  );
}
