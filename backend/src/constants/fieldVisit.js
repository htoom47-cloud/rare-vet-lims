const FIELD_VISIT_CODE = 'FIELD-VISIT';

const parseMoney = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const getFieldVisitService = () => ({
  code: FIELD_VISIT_CODE,
  name_en: 'Field Visit',
  name_ar: 'زيارة ميدانية',
  base_price: parseMoney(process.env.FIELD_VISIT_BASE_PRICE, 150),
  included_km: parseMoney(process.env.FIELD_VISIT_INCLUDED_KM, 30),
  price_per_km: parseMoney(process.env.FIELD_VISIT_PRICE_PER_KM, 4),
});

const calcFieldVisitPrice = (service, distanceKm) => {
  const km = Math.max(0, parseFloat(distanceKm) || 0);
  const flat = parseMoney(service?.base_price, 150);
  const includedKm = parseMoney(service?.included_km, 30);
  const perKm = parseMoney(service?.price_per_km, 4);
  if (km <= includedKm) return flat;
  return Math.round((flat + (km - includedKm) * perKm) * 100) / 100;
};

const listExtraBillingServices = () => [getFieldVisitService()];

module.exports = {
  FIELD_VISIT_CODE,
  getFieldVisitService,
  calcFieldVisitPrice,
  listExtraBillingServices,
};
