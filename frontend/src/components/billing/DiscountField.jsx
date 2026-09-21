import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { billingAPI } from '../../services/api';
import { DISCOUNT_TYPES, isDiscountPresetAllowed, resolveDiscountAmount } from '../../utils/discount';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

const presetLabel = (preset, lang) => {
  const ar = lang?.startsWith('ar');
  return ar ? (preset.name_ar || preset.name) : (preset.name || preset.name_ar);
};

export default function DiscountField({
  subtotal = 0,
  type = DISCOUNT_TYPES.NONE,
  value = '',
  onTypeChange,
  onValueChange,
  className = '',
  labelKey = 'billing.discountType',
  animalCount = 0,
  onPresetChange,
}) {
  const { t, i18n } = useTranslation();
  const [presets, setPresets] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const applied = resolveDiscountAmount(subtotal, type, value);

  useEffect(() => {
    let cancelled = false;
    billingAPI.listDiscountPresets()
      .then(({ data }) => {
        if (!cancelled) setPresets(data.data || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedId = useMemo(() => {
    if (type !== DISCOUNT_TYPES.PERCENT) return '';
    const pct = parseFloat(value) || 0;
    const match = presets.find((p) => parseFloat(p.percent) === pct && isDiscountPresetAllowed(p, animalCount));
    return match?.id || '';
  }, [type, value, presets, animalCount]);

  useEffect(() => {
    if (type === DISCOUNT_TYPES.AMOUNT) {
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onValueChange?.('');
    }
  }, [type, onTypeChange, onValueChange]);

  useEffect(() => {
    if (!presets.length || type !== DISCOUNT_TYPES.PERCENT) return;
    const pct = parseFloat(value) || 0;
    if (!(pct > 0)) return;
    const match = presets.find((p) => parseFloat(p.percent) === pct);
    if (match && !isDiscountPresetAllowed(match, animalCount)) {
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onValueChange?.('');
    }
  }, [animalCount, presets, type, value, onTypeChange, onValueChange]);

  useEffect(() => {
    if (!onPresetChange) return;
    if (type !== DISCOUNT_TYPES.PERCENT || !selectedId) {
      onPresetChange(null);
      return;
    }
    onPresetChange(presets.find((p) => p.id === selectedId) || null);
  }, [onPresetChange, presets, selectedId, type]);

  const gatedMins = useMemo(
    () => [...new Set(presets.filter((p) => (parseInt(p.min_animal_count, 10) || 0) > 0).map((p) => parseInt(p.min_animal_count, 10)))],
    [presets],
  );

  const handleSelect = (id) => {
    if (!id) {
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onValueChange?.('');
      return;
    }
    const preset = presets.find((p) => p.id === id);
    if (!preset || !isDiscountPresetAllowed(preset, animalCount)) return;
    onTypeChange?.(DISCOUNT_TYPES.PERCENT);
    onValueChange?.(String(parseFloat(preset.percent)));
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-1">{t(labelKey)}</label>
      <select
        className="input-field w-full"
        value={selectedId}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={loadError}
      >
        <option value="">{t('billing.discountNone')}</option>
        {presets.map((preset) => {
          const allowed = isDiscountPresetAllowed(preset, animalCount);
          const min = parseInt(preset.min_animal_count, 10) || 0;
          return (
            <option key={preset.id} value={preset.id} disabled={!allowed}>
              {presetLabel(preset, i18n.language)} ({parseFloat(preset.percent)}%)
              {min > 0 ? ` — ${t('billing.discountMinAnimals', { count: min })}` : ''}
            </option>
          );
        })}
      </select>
      {loadError && (
        <p className="text-xs text-red-600 mt-1.5">{t('billing.discountLoadFailed')}</p>
      )}
      {gatedMins.length > 0 && gatedMins.some((min) => animalCount <= min) && (
        <p className="text-xs text-gray-500 mt-1.5">
          {t('billing.discountBulkHint', { count: Math.min(...gatedMins) })}
          {animalCount > 0 ? ` (${t('billing.discountVolumeCount', { count: animalCount })})` : ''}
        </p>
      )}
      {applied > 0 && (
        <p className="text-xs text-red-600 mt-1.5">
          {t('billing.discountApplied')}: − {fmt(applied)}
          {type === DISCOUNT_TYPES.PERCENT && value ? ` (${value}%)` : ''}
        </p>
      )}
    </div>
  );
}
