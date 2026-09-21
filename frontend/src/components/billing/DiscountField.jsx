import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { billingAPI } from '../../services/api';
import {
  DISCOUNT_TYPES,
  filterPresetsByScope,
  isDiscountPresetAllowed,
  resolveDiscountAmount,
} from '../../utils/discount';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;
const OPEN_ID = '__open__';

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
  scope = 'services',
  allowOpen = false,
}) {
  const { t, i18n } = useTranslation();
  const [presets, setPresets] = useState([]);
  const [pickedId, setPickedId] = useState('');
  const [loadError, setLoadError] = useState(false);
  const applied = resolveDiscountAmount(subtotal, type, value);
  const scopedPresets = useMemo(() => filterPresetsByScope(presets, scope), [presets, scope]);

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
    if (allowOpen && pickedId === OPEN_ID) return OPEN_ID;
    const pct = parseFloat(value) || 0;
    if (!(pct > 0)) return '';
    const picked = scopedPresets.find((p) => p.id === pickedId);
    if (picked && parseFloat(picked.percent) === pct) return picked.id;
    if (allowOpen && pickedId === OPEN_ID) return OPEN_ID;
    const match = scopedPresets.find(
      (p) => parseFloat(p.percent) === pct && isDiscountPresetAllowed(p, animalCount),
    );
    if (match) return match.id;
    return allowOpen && pct > 0 ? OPEN_ID : '';
  }, [type, value, scopedPresets, pickedId, animalCount, allowOpen]);

  useEffect(() => {
    if (type === DISCOUNT_TYPES.AMOUNT) {
      setPickedId('');
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onValueChange?.('');
    }
  }, [type, onTypeChange, onValueChange]);

  useEffect(() => {
    if (!scopedPresets.length || type !== DISCOUNT_TYPES.PERCENT) return;
    if (pickedId === OPEN_ID) return;
    const current = scopedPresets.find((p) => p.id === (pickedId || selectedId));
    if (current && !isDiscountPresetAllowed(current, animalCount)) {
      setPickedId('');
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onValueChange?.('');
    }
  }, [animalCount, scopedPresets, type, pickedId, selectedId, onTypeChange, onValueChange]);

  useEffect(() => {
    if (!onPresetChange) return;
    if (type !== DISCOUNT_TYPES.PERCENT || !selectedId || selectedId === OPEN_ID) {
      onPresetChange(null);
      return;
    }
    onPresetChange(scopedPresets.find((p) => p.id === selectedId) || null);
  }, [onPresetChange, scopedPresets, selectedId, type]);

  const gatedMins = useMemo(
    () => [...new Set(scopedPresets.filter((p) => (parseInt(p.min_animal_count, 10) || 0) > 0).map((p) => parseInt(p.min_animal_count, 10)))],
    [scopedPresets],
  );

  const handleSelect = (id) => {
    if (!id) {
      setPickedId('');
      onTypeChange?.(DISCOUNT_TYPES.NONE);
      onValueChange?.('');
      return;
    }
    if (id === OPEN_ID && allowOpen) {
      setPickedId(OPEN_ID);
      onTypeChange?.(DISCOUNT_TYPES.PERCENT);
      onValueChange?.('');
      return;
    }
    const preset = scopedPresets.find((p) => p.id === id);
    if (!preset || !isDiscountPresetAllowed(preset, animalCount)) return;
    setPickedId(id);
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
        {scopedPresets.map((preset) => {
          const allowed = isDiscountPresetAllowed(preset, animalCount);
          const min = parseInt(preset.min_animal_count, 10) || 0;
          return (
            <option key={preset.id} value={preset.id} disabled={!allowed}>
              {presetLabel(preset, i18n.language)} ({parseFloat(preset.percent)}%)
              {min > 0 ? ` — ${t('billing.discountMinAnimals', { count: min })}` : ''}
            </option>
          );
        })}
        {allowOpen && (
          <option value={OPEN_ID}>{t('billing.discountOpen')}</option>
        )}
      </select>
      {allowOpen && selectedId === OPEN_ID && (
        <input
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          className="input-field w-full mt-2"
          placeholder={t('billing.discountOpenPercent')}
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
        />
      )}
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
