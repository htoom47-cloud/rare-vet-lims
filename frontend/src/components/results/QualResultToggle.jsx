import { canonicalQualValue } from '../../utils/formatResultValue';

export default function QualResultToggle({ value, onChange, labels }) {
  const current = canonicalQualValue(value);
  return (
    <div className="flex gap-1 max-w-xs">
      {[
        { v: 'Negative', label: labels.negative, active: 'bg-green-600 text-white' },
        { v: 'Positive', label: labels.positive, active: 'bg-red-600 text-white' },
      ].map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border border-primary-200 dark:border-primary-700 transition ${
            current === opt.v ? opt.active : 'hover:bg-primary-50 dark:hover:bg-primary-900/30'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
