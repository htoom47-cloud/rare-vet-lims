export default function PageHeader({ title, subtitle, action, badge }) {
  return (
    <div className="page-header">
      <div className="min-w-0 flex-1">
        {badge && (
          <span className="inline-block mb-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 text-primary-600 dark:bg-primary-800 dark:text-primary-300">
            {badge}
          </span>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
