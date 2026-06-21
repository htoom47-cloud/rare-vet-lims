import { useTranslation } from 'react-i18next';

function TableSkeleton({ cols = 4 }) {
  return (
    <div className="card space-y-3">
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="skeleton h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function DataTable({ columns, data, loading, onRowClick }) {
  const { t } = useTranslation();

  if (loading) {
    return <TableSkeleton cols={Math.min(columns?.length || 4, 6)} />;
  }

  if (!data?.length) {
    return (
      <div className="card text-center py-14">
        <p className="text-primary-400 text-sm">{t('common.noData')}</p>
      </div>
    );
  }

  return (
    <div className="table-container bg-white dark:bg-primary-800 rounded-2xl shadow-card border border-primary-200/50 dark:border-primary-700 overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-primary-100 dark:divide-primary-700 bg-white dark:bg-primary-800">
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-700/30' : ''}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
