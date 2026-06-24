const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  received: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  running: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  partial_refunded: 'bg-amber-100 text-amber-800',
  refunded: 'bg-purple-100 text-purple-700',
  NORMAL: 'bg-green-100 text-green-700',
  LOW: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRIT_LOW: 'bg-red-100 text-red-700',
  CRIT_HIGH: 'bg-red-100 text-red-700',
};

export default function StatusBadge({ status, label }) {
  const color = statusColors[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`status-badge ${color}`}>
      {label || status}
    </span>
  );
}
