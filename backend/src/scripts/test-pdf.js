const path = require('path');
const fs = require('fs');
const { generateReportPDF } = require('../utils/pdf');
const { generateInterpretation } = require('../services/ai-interpretation.service');
const { NORMA_CBC_ORDER } = require('../utils/norma-cbc-map');

const mk = (code, nameEn, nameAr, value, unit, min, max, flag) => ({
  code, nameEn, nameAr, testNameEn: 'Complete Blood Count (CBC)', testNameAr: 'تعداد الدم الكامل',
  value, numericValue: Number(value), unit, minValue: min, maxValue: max,
  reference: min != null ? `${min} - ${max}` : '-', flag, isCritical: flag?.startsWith('CRIT'),
});

const byCode = {
  WBC: mk('WBC', 'WBC', 'كريات الدم البيضاء', '28.5', '10^3/uL', 4, 15, 'HIGH'),
  LYM: mk('LYM', 'Lymphocytes', 'اللمفاويات', '3.5', '10^3/uL', null, null, 'NORMAL'),
  MON: mk('MON', 'Monocytes', 'الوحيدات', '1.9', '10^3/uL', null, null, 'NORMAL'),
  NEU: mk('NEU', 'Neutrophils', 'العدلات', '22.4', '10^3/uL', null, null, 'HIGH'),
  EOS: mk('EOS', 'Eosinophils', 'الحمضات', '0.8', '10^3/uL', null, null, 'NORMAL'),
  BAS: mk('BAS', 'Basophils', 'القعدات', '0.0', '10^3/uL', null, null, 'NORMAL'),
  RBC: mk('RBC', 'RBC', 'كريات الدم الحمراء', '9.40', '10^6/uL', 5, 12, 'NORMAL'),
  HGB: mk('HGB', 'Hemoglobin', 'الهيموجلوبين', '11.4', 'g/dL', 8, 18, 'NORMAL'),
  MCV: mk('MCV', 'MCV', 'حجم الكرية الوسطي', '28', 'fL', null, null, 'NORMAL'),
  HCT: mk('HCT', 'Hematocrit', 'الهيماتوكريت', '26', '%', 24, 46, 'NORMAL'),
  MCH: mk('MCH', 'MCH', 'هيموجلوبين الكرية', '12.2', 'pg', null, null, 'NORMAL'),
  MCHC: mk('MCHC', 'MCHC', 'تركيز الهيموجلوبين', '43.9', 'g/dL', null, null, 'NORMAL'),
  RDW: mk('RDW', 'RDW-CV', 'توزيع كريات الدم الحمراء', '32.4', '%', null, null, 'NORMAL'),
  PLT: mk('PLT', 'Platelets', 'الصفائح الدموية', '676', '10^3/uL', 100, 800, 'NORMAL'),
  MPV: mk('MPV', 'MPV', 'حجم الصفيح الوسطي', '5.5', 'fL', null, null, 'NORMAL'),
};

const results = NORMA_CBC_ORDER.filter((code) => byCode[code]).map((code) => byCode[code]);

generateReportPDF({
  reportNumber: 'RPT-260613-377995',
  sampleCode: 'SMP-260613-489735',
  date: new Date('2026-06-13'),
  customerName: 'Ali Emam Abuella',
  animalCode: 'ANM-260609-935188',
  animalType: 'camel',
  animalName: 'Rare',
  animalGender: 'male',
  language: 'ar',
  verificationCode: 'CC2C7F4A-44A',
  specialistName: 'مدير النظام',
  aiInterpretation: generateInterpretation(results.map((r) => ({ ...r, name: r.nameEn })), 'ar', 'camel'),
  treatmentRecommendations: '',
  results,
}, path.join(__dirname, '../../uploads/reports'), { filename: 'test-compact-15.pdf' })
  .then((r) => console.log('OK', r.filePath))
  .catch((e) => { console.error(e); process.exit(1); });
