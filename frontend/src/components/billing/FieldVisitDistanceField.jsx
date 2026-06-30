import { useTranslation } from 'react-i18next';
import { calcFieldVisitPrice, fieldVisitTierRanges } from '../../utils/fieldVisitService';

export default function FieldVisitDistanceField({
  fieldVisit,
  km,
  onKmChange,
  fmt,
  disabled = false,
}) {
  const { t, i18n } = useTranslation();
  const tiers = fieldVisitTierRanges(fieldVisit);
  const kmNum = parseFloat(km);
  const hasKm = km !== '' && Number.isFinite(kmNum) && kmNum >= 0;

  return (
    <div className="space-y-2">
      <label className="block text-xs text-gray-500">{t('priceList.distanceFromLab')}</label>
      <input
        type="number"
        min="0"
        step="0.1"
        value={km}
        onChange={(e) => onKmChange(e.target.value)}
        placeholder={t('priceList.enterDistanceKm')}
        className="input-field max-w-xs"
        disabled={disabled}
      />
      <div className="text-xs text-gray-500 space-y-0.5">
        <p className="font-medium text-gray-600 dark:text-gray-400">{t('priceList.fieldVisitTiersTitle')}</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
          {tiers.map((tier) => (
            <li key={tier.max_km}>
              {i18n.language === 'ar'
                ? `${tier.min_km}–${tier.max_km} كم: ${fmt(tier.price)}`
                : `${tier.min_km}–${tier.max_km} km: ${fmt(tier.price)}`}
            </li>
          ))}
        </ul>
        {hasKm && (
          <p className="text-primary-700 font-medium pt-1">
            {t('priceList.fieldVisitPriceForKm', { km: kmNum, price: fmt(calcFieldVisitPrice(fieldVisit, kmNum)) })}
          </p>
        )}
      </div>
    </div>
  );
}
