export const formatHerdDate = (value, isAr) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const formatHerdDateTime = (value, isAr) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(isAr ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const isoDate = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

export const formatComputedAge = (age, isAr) => {
  if (!age) return null;
  const y = age.years || 0;
  const m = age.months || 0;
  if (!y && !m) return isAr ? 'أقل من شهر' : 'Under 1 month';
  if (isAr) {
    const ys = y ? `${y} ${y === 1 ? 'سنة' : 'سنوات'}` : '';
    const ms = m ? `${m} ${m === 1 ? 'شهر' : 'أشهر'}` : '';
    return [ys, ms].filter(Boolean).join(' و ');
  }
  const ys = y ? `${y}y` : '';
  const ms = m ? `${m}m` : '';
  return [ys, ms].filter(Boolean).join(' ');
};

export const dueStatus = (nextDue) => {
  if (!nextDue) return null;
  const due = new Date(nextDue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 14) return 'due';
  return 'ok';
};
