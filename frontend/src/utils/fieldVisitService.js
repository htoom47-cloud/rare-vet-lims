import { billingAPI } from '../services/api';

export const FIELD_VISIT_CODE = 'FIELD-VISIT';

export const DEFAULT_FIELD_VISIT = {
  code: FIELD_VISIT_CODE,
  name_en: 'Field Visit',
  name_ar: 'زيارة ميدانية',
  base_price: 150,
  included_km: 30,
  price_per_km: 4,
};

const parseMoney = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const calcFieldVisitPrice = (service, distanceKm) => {
  const km = Math.max(0, parseFloat(distanceKm) || 0);
  const flat = parseMoney(service?.base_price, DEFAULT_FIELD_VISIT.base_price);
  const includedKm = parseMoney(service?.included_km, DEFAULT_FIELD_VISIT.included_km);
  const perKm = parseMoney(service?.price_per_km, DEFAULT_FIELD_VISIT.price_per_km);
  if (km <= includedKm) return flat;
  return Math.round((flat + (km - includedKm) * perKm) * 100) / 100;
};

export const fieldVisitLabel = (service, i18n) => (
  i18n?.language === 'ar'
    ? (service?.name_ar || DEFAULT_FIELD_VISIT.name_ar)
    : (service?.name_en || DEFAULT_FIELD_VISIT.name_en)
);

export const fieldVisitDescription = (service, i18n, distanceKm) => {
  const km = parseFloat(distanceKm);
  const label = fieldVisitLabel(service, i18n);
  if (!Number.isFinite(km) || km <= 0) return label;
  return i18n?.language === 'ar' ? `${label} — ${km} كم` : `${label} — ${km} km`;
};

export const isFieldVisitItem = (item) => item?.service_code === FIELD_VISIT_CODE;

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
  const { service_code, distance_km, ...rest } = line;
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

export const loadCustomerFieldVisitDistance = async (customerId) => {
  if (!customerId) return null;
  try {
    const { data } = await billingAPI.fieldVisitDistance(customerId);
    return data?.data || null;
  } catch {
    return null;
  }
};
