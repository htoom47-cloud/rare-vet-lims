const FIELD_VISIT_CODE = 'FIELD-VISIT';

const getFieldVisitService = () => {
  const price = parseFloat(process.env.FIELD_VISIT_PRICE);
  return {
    code: FIELD_VISIT_CODE,
    name_en: 'Field Visit',
    name_ar: 'زيارة ميدانية',
    price: Number.isFinite(price) && price >= 0 ? price : 500,
  };
};

const listExtraBillingServices = () => [getFieldVisitService()];

module.exports = {
  FIELD_VISIT_CODE,
  getFieldVisitService,
  listExtraBillingServices,
};
