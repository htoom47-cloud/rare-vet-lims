export const FIELD_VISIT_CODE = 'FIELD-VISIT';

export const DEFAULT_DISTANCE_TIERS = [
  { max_km: 30, price: 150 },
  { max_km: 60, price: 200 },
  { max_km: 80, price: 250 },
  { max_km: 100, price: 300 },
  { max_km: 120, price: 350 },
  { max_km: 150, price: 400 },
  { max_km: 200, price: 450 },
];

export const DEFAULT_FIELD_VISIT = {
  code: FIELD_VISIT_CODE,
  name_en: 'Field Visit',
  name_ar: 'زيارة ميدانية',
  distance_tiers: DEFAULT_DISTANCE_TIERS,
};

const parseMoney = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const getDistanceTiers = (service) => {
  const tiers = service?.distance_tiers;
  if (Array.isArray(tiers) && tiers.length > 0) {
    return [...tiers].sort((a, b) => a.max_km - b.max_km);
  }
  return DEFAULT_DISTANCE_TIERS;
};

export const calcFieldVisitPrice = (service, distanceKm) => {
  const km = Math.max(0, parseFloat(distanceKm) || 0);
  const tiers = getDistanceTiers(service);
  for (const tier of tiers) {
    if (km <= tier.max_km) return tier.price;
  }
  const last = tiers[tiers.length - 1];
  const extra = km - last.max_km;
  const steps = Math.ceil(extra / 20);
  return last.price + steps * 50;
};

export const fieldVisitTierRanges = (service) => {
  const tiers = getDistanceTiers(service);
  let prevMax = 0;
  return tiers.map((tier) => {
    const min_km = prevMax === 0 ? 0 : prevMax + 1;
    const range = { min_km, max_km: tier.max_km, price: tier.price };
    prevMax = tier.max_km;
    return range;
  });
};

export const fieldVisitLabel = (service, i18n) => (
  i18n?.language === 'ar'
    ? (service?.name_ar || DEFAULT_FIELD_VISIT.name_ar)
    : (service?.name_en || DEFAULT_FIELD_VISIT.name_en)
);

export const fieldVisitDescription = (service, i18n, distanceKm) => {
  const km = parseFloat(distanceKm);
  const label = fieldVisitLabel(service, i18n);
  if (!Number.isFinite(km) || km < 0) return label;
  return i18n?.language === 'ar' ? `${label} — ${km} كم من المختبر` : `${label} — ${km} km from lab`;
};

export const isFieldVisitItem = (item) => {
  if (item?.service_code === FIELD_VISIT_CODE) return true;
  const d = String(item?.description || '');
  return /field visit|زيارة ميدانية/i.test(d);
};

export const buildFieldVisitLineItem = (service, i18n, distanceKm, { withKey } = {}) => {
  const svc = service || DEFAULT_FIELD_VISIT;
  const item = {
    service_code: FIELD_VISIT_CODE,
    distance_km: distanceKm,
    description: fieldVisitDescription(svc, i18n, distanceKm),
    quantity: 1,
    unit_price: calcFieldVisitPrice(svc, distanceKm),
  };
  if (withKey) {
    item._key = `${Date.now()}-${FIELD_VISIT_CODE}`;
  }
  return item;
};

export const buildFieldVisitInvoiceItem = (service, i18n, distanceKm) => {
  const line = buildFieldVisitLineItem(service, i18n, distanceKm);
  const { distance_km, ...rest } = line;
  return rest;
};

export const refreshFieldVisitItem = (item, service, i18n) => {
  if (!isFieldVisitItem(item)) return item;
  const km = item.distance_km;
  return {
    ...item,
    description: fieldVisitDescription(service, i18n, km),
    unit_price: calcFieldVisitPrice(service, km),
  };
};
