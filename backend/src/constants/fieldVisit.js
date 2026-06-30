const FIELD_VISIT_CODE = 'FIELD-VISIT';

const DEFAULT_DISTANCE_TIERS = [
  { max_km: 30, price: 150 },
  { max_km: 60, price: 200 },
  { max_km: 80, price: 250 },
  { max_km: 100, price: 300 },
  { max_km: 120, price: 350 },
  { max_km: 150, price: 400 },
  { max_km: 200, price: 450 },
];

const parseMoney = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const parseDistanceTiers = () => {
  const raw = process.env.FIELD_VISIT_DISTANCE_TIERS;
  if (!raw) return DEFAULT_DISTANCE_TIERS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DISTANCE_TIERS;
    return parsed
      .map((tier) => ({
        max_km: parseMoney(tier.max_km, null),
        price: parseMoney(tier.price, null),
      }))
      .filter((tier) => tier.max_km != null && tier.price != null)
      .sort((a, b) => a.max_km - b.max_km);
  } catch {
    return DEFAULT_DISTANCE_TIERS;
  }
};

const getDistanceTiers = (service) => {
  const tiers = service?.distance_tiers;
  if (Array.isArray(tiers) && tiers.length > 0) {
    return [...tiers].sort((a, b) => a.max_km - b.max_km);
  }
  return parseDistanceTiers();
};

const getFieldVisitService = () => ({
  code: FIELD_VISIT_CODE,
  name_en: 'Field Visit',
  name_ar: 'زيارة ميدانية',
  distance_tiers: parseDistanceTiers(),
});

const calcFieldVisitPrice = (service, distanceKm) => {
  const km = Math.max(0, parseFloat(distanceKm) || 0);
  const tiers = getDistanceTiers(service);
  for (const tier of tiers) {
    if (km <= tier.max_km) return tier.price;
  }
  const last = tiers[tiers.length - 1];
  const stepKm = parseMoney(process.env.FIELD_VISIT_OVERAGE_STEP_KM, 20);
  const stepPrice = parseMoney(process.env.FIELD_VISIT_OVERAGE_STEP_PRICE, 50);
  const extra = km - last.max_km;
  const steps = Math.ceil(extra / stepKm);
  return last.price + steps * stepPrice;
};

const listExtraBillingServices = () => [getFieldVisitService()];

module.exports = {
  FIELD_VISIT_CODE,
  DEFAULT_DISTANCE_TIERS,
  getFieldVisitService,
  getDistanceTiers,
  calcFieldVisitPrice,
  listExtraBillingServices,
};
