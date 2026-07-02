/** Report UI strings — single language per print (ar | en). */
const ANIMALS = {
  ar: {
    camel: 'جمل', horse: 'حصان', sheep: 'غنم', goat: 'ماعز',
    bird: 'طائر', cat: 'قط', dog: 'كلب',
  },
  en: {
    camel: 'Camel', horse: 'Horse', sheep: 'Sheep', goat: 'Goat',
    bird: 'Bird', cat: 'Cat', dog: 'Dog',
  },
};

const LABELS = {
  ar: {
    orderId: 'رقم الطلب',
    customerName: 'اسم العميل',
    customerMobile: 'جوال العميل',
    nationalId: 'الهوية الوطنية',
    analysisDate: 'تاريخ التحليل',
    animalId: 'رقم الحيوان',
    animalType: 'نوع الحيوان',
    animalChip: 'شريحة الحيوان',
    interpretation: 'التفسير المخبري',
    scanVerify: 'امسح للتحقق',
    vetSignature: 'توقيع الطبيب البيطري',
    issuedBy: 'صادر من',
    page: 'صفحة',
    parameter: 'المعامل',
    result: 'النتيجة',
    refRange: 'المدى المرجعي',
  },
  en: {
    orderId: 'Order ID',
    customerName: 'Customer Name',
    customerMobile: 'Customer Mobile',
    nationalId: 'National ID',
    analysisDate: 'Analysis Date',
    animalId: 'Animal ID No.',
    animalType: 'Animal Type',
    animalChip: 'Animal Chip ID',
    interpretation: 'Interpretation',
    scanVerify: 'Scan to verify',
    vetSignature: 'Veterinarian Signature',
    issuedBy: 'Issued by',
    page: 'Page',
    parameter: 'Parameter',
    result: 'Result',
    refRange: 'Ref. Range',
  },
};

const isArabic = (lang) => lang === 'ar';

const t = (lang) => LABELS[isArabic(lang) ? 'ar' : 'en'];

const animalLabel = (lang, type) => {
  const key = isArabic(lang) ? 'ar' : 'en';
  return ANIMALS[key][type] || type || '-';
};

module.exports = { isArabic, t, animalLabel };
