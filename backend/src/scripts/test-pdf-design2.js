/**
 * Generate a sample premium report PDF (design 2) for visual QA.
 * Usage: node src/scripts/test-pdf-design2.js
 */
const path = require('path');
const { generateReportPDF } = require('../utils/pdf');
const { NORMA_CBC_ORDER } = require('../utils/norma-cbc-map');

const mk = (code, nameEn, nameAr, value, unit, min, max, flag) => ({
  code,
  nameEn,
  nameAr,
  testNameEn: 'Complete Blood Count (CBC)',
  testNameAr: 'تعداد الدم الكامل',
  value,
  numericValue: Number(value),
  unit,
  minValue: min,
  maxValue: max,
  reference: min != null ? `${min} – ${max}` : '-',
  flag,
  isCritical: flag?.startsWith('CRIT'),
});

const byCode = {
  WBC: mk('WBC', 'WBC', 'كريات الدم البيضاء', '41.8', '10^3/uL', 4, 15, 'HIGH'),
  LYM: mk('LYM', 'LYM', 'اللمفاويات', '2.1', '10^3/uL', 1, 5, 'NORMAL'),
  MON: mk('MON', 'MON', 'الوحيدات', '1.2', '10^3/uL', 0.1, 1.5, 'NORMAL'),
  NEU: mk('NEU', 'NEU', 'العدلات', '36.3', '10^3/uL', 2, 10, 'HIGH'),
  EOS: mk('EOS', 'EOS', 'الحمضات', '0.8', '10^3/uL', 0, 1.5, 'NORMAL'),
  BAS: mk('BAS', 'BAS', 'القعدات', '0.1', '10^3/uL', 0, 0.3, 'NORMAL'),
  RBC: mk('RBC', 'RBC', 'كريات الدم الحمراء', '6.2', '10^6/uL', 5, 12, 'NORMAL'),
  HGB: mk('HGB', 'HGB', 'الهيموجلوبين', '79', 'g/L', 80, 160, 'LOW'),
  MCV: mk('MCV', 'MCV', 'حجم الكرية الوسطي', '68', 'fL', 60, 90, 'NORMAL'),
  HCT: mk('HCT', 'HCT', 'الهيماتوكريت', '17', '%', 24, 46, 'LOW'),
  MCH: mk('MCH', 'MCH', 'هيموجلوبين الكرية', '12.7', 'pg', 10, 18, 'NORMAL'),
  MCHC: mk('MCHC', 'MCHC', 'تركيز الهيموجلوبين', '330', 'g/L', 300, 360, 'NORMAL'),
  'RDW-SD': mk('RDW-SD', 'RDW-SD', 'توزيع كريات الدم', '38', 'fL', 30, 50, 'NORMAL'),
  'RDW-CV': mk('RDW-CV', 'RDW-CV', 'معامل التوزيع', '18', '%', 10, 20, 'NORMAL'),
  PLT: mk('PLT', 'PLT', 'الصفائح الدموية', '46', '10^3/uL', 100, 800, 'LOW'),
  MPV: mk('MPV', 'MPV', 'حجم الصفيح الوسطي', '8.2', 'fL', 5, 12, 'NORMAL'),
  PCT: mk('PCT', 'PCT', 'نسبة الصفائح', '0.02', '%', 0.1, 0.5, 'LOW'),
  'PDW-SD': mk('PDW-SD', 'PDW-SD', 'توزيع الصفائح', '12', 'fL', 8, 20, 'NORMAL'),
  'PDW-CV': mk('PDW-CV', 'PDW-CV', 'معامل الصفائح', '53.6', '%', 10, 20, 'HIGH'),
  'PLC-R': mk('PLC-R', 'PLC-R', 'نسبة الصفائح الكبيرة', '18', '%', 10, 40, 'NORMAL'),
  'PLC-C': mk('PLC-C', 'PLC-C', 'عدد الصفائح الكبيرة', '2', '10^3/uL', 10, 100, 'LOW'),
};

const results = NORMA_CBC_ORDER.filter((code) => byCode[code]).map((code) => byCode[code]);

generateReportPDF({
  reportNumber: 'RPT-260630-957561',
  sampleCode: 'SMP-260630-037056',
  barcode: 'BC-260630-537773',
  date: new Date('2026-07-01'),
  collectionDate: new Date('2026-07-01'),
  issuedDate: new Date('2026-07-01'),
  customerName: 'عبدالله الوهيبي',
  customerMobile: '050444006',
  animalCode: 'ANM-CAMEL-001',
  animalType: 'camel',
  animalName: 'السكبه',
  animalGender: 'female',
  animalAge: '5 years',
  animalBreed: 'مجاهيم',
  language: 'ar',
  verificationCode: 'A1B2C3D4E5F6',
  isFinal: true,
  panelName: 'CBC / Hematology',
  labApproval: { approved: true, name: 'أخصائي المختبر', license: 'LAB-12345', approvedAt: new Date() },
  vetApproval: { approved: true, name: 'د. محمد', license: 'VET-98765', approvedAt: new Date() },
  previousByCode: {
    WBC: { value: '28.5', numericValue: 28.5 },
    PLT: { value: '120', numericValue: 120 },
    HGB: { value: '95', numericValue: 95 },
  },
  trendHistory: {
    WBC: [
      { numericValue: 20, value: '20' },
      { numericValue: 28.5, value: '28.5' },
      { numericValue: 41.8, value: '41.8' },
    ],
    PLT: [
      { numericValue: 180, value: '180' },
      { numericValue: 120, value: '120' },
      { numericValue: 46, value: '46' },
    ],
    HGB: [
      { numericValue: 110, value: '110' },
      { numericValue: 95, value: '95' },
      { numericValue: 79, value: '79' },
    ],
  },
  results,
}, path.join(__dirname, '../../uploads/reports'), { filename: 'test-premium-design2.pdf' })
  .then((r) => console.log('OK', r.filePath))
  .catch((e) => { console.error(e); process.exit(1); });
