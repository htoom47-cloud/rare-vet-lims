/** Tests under this category are entered via the parasitology workbench. */
const PARAS_CATEGORY_CODE = 'MICRO';

/** Default parasitology tests — brucella resolved via consolidate-brucella-catalog (BRUCELLA keeper). */
const PARAS_TEST_CODES = ['PARAS-BLOOD', 'PARAS-STOOL', 'BRUCELLA', 'BRU-ROSE-BENGAL'];

const NO_PARASITE_FOUND_VALUE = 'لم يتم العثور على أي طفيلي بعد الفحص';
const NO_MALTA_FOUND_VALUE = 'لا توجد مالطيه';

const isNoneFoundValue = (value) => {
  const v = String(value || '').trim();
  return v === NO_PARASITE_FOUND_VALUE || v === NO_MALTA_FOUND_VALUE;
};

module.exports = {
  PARAS_CATEGORY_CODE,
  PARAS_TEST_CODES,
  NO_PARASITE_FOUND_VALUE,
  NO_MALTA_FOUND_VALUE,
  isNoneFoundValue,
};
