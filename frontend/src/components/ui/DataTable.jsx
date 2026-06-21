import { useTranslation } from 'react-i18next';
import { Skeleton } from './skeleton';
import { Card } from './card';

function TableSkeleton({ cols = 4 }) {
  return (
    <Card className="space-y-3">
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </Card>
  );
}

export default function DataTable({ columns, data, loading, onRowClick }) {
  const { t } = useTranslation();

  if (loading) {
    return <TableSkeleton cols={Math.min(columns?.length || 4, 6)} />;
  }

  if (!data?.length) {
    return (
      <Card className="text-center py-14">
        <p className="text-muted-foreground text-sm">{t('common.noData')}</p>
      </Card>
    );
  }

  return (
    <div className="table-container bg-card rounded-2xl shadow-card border border-border/60 overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 bg-card">
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer hover:bg-accent/50 transition-colors duration-150' : ''}
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
