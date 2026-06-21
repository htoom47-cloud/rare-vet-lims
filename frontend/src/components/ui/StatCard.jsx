export default function StatCard({ title, value, icon: Icon, color = 'primary', subtitle }) {
  const colors = {
    primary: 'bg-primary-100 dark:bg-primary-700/40 text-primary-600 dark:text-primary-300',
    gold: 'bg-primary-100 dark:bg-primary-700/40 text-primary-400',
    green: 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-400',
    red: 'bg-red-50 dark:bg-red-900/25 text-red-600 dark:text-red-400',
    blue: 'bg-sky-50 dark:bg-sky-900/25 text-sky-700 dark:text-sky-400',
    orange: 'bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-400',
  };

  return (
    <div className="card flex items-start gap-4 hover:shadow-card-hover transition-shadow">
      {Icon && (
        <div className={`p-3 rounded-xl shrink-0 ${colors[color]}`}>
          <Icon size={22} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm text-primary-500 dark:text-primary-400">{title}</p>
        <p className="text-2xl font-bold mt-0.5 text-primary-800 dark:text-primary-100 tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-primary-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
