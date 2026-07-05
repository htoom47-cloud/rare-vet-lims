import { useTranslation } from 'react-i18next';
import { DISCOUNT_TYPES, resolveDiscountAmount } from '../../utils/discount';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

export default function DiscountField({
  subtotal = 0,
  type = DISCOUNT_TYPES.NONE,
  value = '',
  onTypeChange,
  onValueChange,
  className = '',
  labelKey = 'billing.discountType',
}) {
  const { t } = useTranslation();
  const applied = resolveDiscountAmount(subtotal, type, value);

  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-1">{t(labelKey)}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          className="input-field sm:w-44"
          value={type}
          onChange={(e) => {
            onTypeChange?.(e.target.value);
            if (e.target.value === DISCOUNT_TYPES.NONE) onValueChange?.('');
          }}
        >
          <option value={DISCOUNT_TYPES.NONE}>{t('billing.discountNone')}</option>
          <option value={DISCOUNT_TYPES.PERCENT}>{t('billing.discountPercent')}</option>
          <option value={DISCOUNT_TYPES.AMOUNT}>{t('billing.discountFixed')}</option>
        </select>
        {type !== DISCOUNT_TYPES.NONE && (
          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              max={type === DISCOUNT_TYPES.PERCENT ? 100 : undefined}
              step={type === DISCOUNT_TYPES.PERCENT ? '1' : '0.01'}
              className="input-field pe-12"
              placeholder={type === DISCOUNT_TYPES.PERCENT ? '10' : '0.00'}
              value={value}
              onChange={(e) => onValueChange?.(e.target.value)}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
              {type === DISCOUNT_TYPES.PERCENT ? '%' : 'SAR'}
            </span>
          </div>
        )}
      </div>
      {applied > 0 && (
        <p className="text-xs text-red-600 mt-1.5">
          {t('billing.discountApplied')}: − {fmt(applied)}
          {type === DISCOUNT_TYPES.PERCENT && value ? ` (${value}%)` : ''}
        </p>
      )}
    </div>
  );
}
