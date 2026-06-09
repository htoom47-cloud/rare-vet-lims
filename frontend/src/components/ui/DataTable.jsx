import { useTranslation } from 'react-i18next';

export default function DataTable({ columns, data, loading, onRowClick }) {
  const { t } = useTranslation();

  if (loading) {
    return <div className="card text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  if (!data?.length) {
    return <div className="card text-center py-12 text-gray-500">{t('common.noData')}</div>;
  }

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer' : ''}
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
