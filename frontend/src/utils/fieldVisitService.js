export const FIELD_VISIT_CODE = 'FIELD-VISIT';

export const DEFAULT_FIELD_VISIT = {
  code: FIELD_VISIT_CODE,
  name_en: 'Field Visit',
  name_ar: 'زيارة ميدانية',
  price: 500,
};

export const fieldVisitLabel = (service, i18n) => (
  i18n?.language === 'ar' ? (service?.name_ar || DEFAULT_FIELD_VISIT.name_ar) : (service?.name_en || DEFAULT_FIELD_VISIT.name_en)
);

export const isFieldVisitItem = (item) => item?.service_code === FIELD_VISIT_CODE;

export const buildFieldVisitLineItem = (service, i18n, { withKey } = {}) => {
  const svc = service || DEFAULT_FIELD_VISIT;
  const item = {
    service_code: FIELD_VISIT_CODE,
    description: fieldVisitLabel(svc, i18n),
    quantity: 1,
    unit_price: parseFloat(svc.price) || DEFAULT_FIELD_VISIT.price,
  };
  if (withKey) {
    item._key = `${Date.now()}-${FIELD_VISIT_CODE}`;
  }
  return item;
};

export const buildFieldVisitInvoiceItem = (service, i18n) => {
  const line = buildFieldVisitLineItem(service, i18n);
  const { service_code, ...rest } = line;
  return rest;
};
