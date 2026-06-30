/** Sample report data for preview / demo without backend */
const demoImage = (label, hue = 30) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <rect width="320" height="200" fill="#f7f5f2"/>
      <circle cx="160" cy="95" r="48" fill="hsl(${hue},35%,72%)" opacity="0.85"/>
      <circle cx="130" cy="80" r="18" fill="hsl(${hue},45%,55%)" opacity="0.6"/>
      <circle cx="190" cy="110" r="22" fill="hsl(${hue},40%,50%)" opacity="0.5"/>
      <text x="160" y="178" text-anchor="middle" font-family="Arial" font-size="13" fill="#5B3A29">${label}</text>
    </svg>`
  )}`;

export const DEMO_REPORT = {
  id: 'demo',
  sampleId: 'demo-sample',
  pdfUrl: null,
  reportNumber: 'RPT-2026-0042',
  orderNumber: 'INV-2026-0187',
  sampleCode: 'SMP-CML-0042',
  barcode: 'SMP-CML-0042',
  status: 'final',
  language: 'ar',
  issuedAt: '2026-06-15T14:30:00Z',
  requestedAt: '2026-06-14T09:15:00Z',
  verificationCode: 'DEMO-VERIFY-0042',
  verifyUrl: '/verify/DEMO-VERIFY-0042',
  lab: {
    name: 'AL NAWADER VETERINARY CARE CENTER',
    nameAr: 'مركز رعاية النوادر البيطري',
    subtitle: 'Veterinary Medical & Research Laboratory',
    subtitleAr: 'للتحاليل الطبية والبحثية البيطرية',
    address: 'المملكة العربية السعودية',
    phone: '0115007257',
    email: 'alnwader.10hz@gmail.com',
  },
  customer: {
    name: 'أحمد بن محمد العتيبي',
    mobile: '+966501234567',
  },
  animal: {
    code: 'ANM-CML-0089',
    type: 'camel',
    name: 'نادر',
    gender: 'male',
    chip: '982000123456789',
    age: '4 سنوات',
    color: 'بني فاتح',
    weight: 420,
  },
  sample: {
    id: 'SMP-CML-0042',
    type: 'Blood — EDTA + Stool',
    collectionDate: '2026-06-14T09:15:00Z',
    receivedDate: '2026-06-14T10:45:00Z',
    condition: 'Acceptable',
    collectedBy: 'سارة الحربي',
  },
  results: [
    { testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'تعداد الدم الكامل', testNameEn: 'Complete Blood Count', code: 'WBC', nameAr: 'كريات الدم البيضاء', nameEn: 'White Blood Cells', value: '12.4', unit: '10³/µL', reference: '6.0 - 12.0', flag: 'HIGH', isCritical: false, instrument: 'Norma Icon' },
    { testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'تعداد الدم الكامل', testNameEn: 'Complete Blood Count', code: 'RBC', nameAr: 'كريات الدم الحمراء', nameEn: 'Red Blood Cells', value: '7.8', unit: '10⁶/µL', reference: '7.0 - 12.0', flag: 'NORMAL', isCritical: false, instrument: 'Norma Icon' },
    { testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'تعداد الدم الكامل', testNameEn: 'Complete Blood Count', code: 'HGB', nameAr: 'الهيموجلوبين', nameEn: 'Hemoglobin', value: '11.2', unit: 'g/dL', reference: '11.0 - 16.0', flag: 'NORMAL', isCritical: false, instrument: 'Norma Icon' },
    { testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'تعداد الدم الكامل', testNameEn: 'Complete Blood Count', code: 'HCT', nameAr: 'الهيماتوكريت', nameEn: 'Hematocrit', value: '32.1', unit: '%', reference: '30.0 - 45.0', flag: 'NORMAL', isCritical: false, instrument: 'Norma Icon' },
    { testCode: 'CBC-FULL', categoryCode: 'CBC', testNameAr: 'تعداد الدم الكامل', testNameEn: 'Complete Blood Count', code: 'PLT', nameAr: 'الصفائح الدموية', nameEn: 'Platelets', value: '98', unit: '10³/µL', reference: '150 - 400', flag: 'LOW', isCritical: false, instrument: 'Norma Icon' },
    { testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'لوحة الكيمياء الأساسية', testNameEn: 'Basic Chemistry Panel', code: 'GLU', nameAr: 'الجلوكوز', nameEn: 'Glucose', value: '95', unit: 'mg/dL', reference: '60 - 120', flag: 'NORMAL', isCritical: false, instrument: 'Diasys Respons 910' },
    { testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'لوحة الكيمياء الأساسية', testNameEn: 'Basic Chemistry Panel', code: 'BUN', nameAr: 'نيتروجين اليوريا', nameEn: 'Blood Urea Nitrogen', value: '38', unit: 'mg/dL', reference: '10 - 30', flag: 'HIGH', isCritical: false, instrument: 'Diasys Respons 910' },
    { testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'لوحة الكيمياء الأساسية', testNameEn: 'Basic Chemistry Panel', code: 'CREA', nameAr: 'الكرياتينين', nameEn: 'Creatinine', value: '1.4', unit: 'mg/dL', reference: '0.8 - 2.0', flag: 'NORMAL', isCritical: false, instrument: 'Diasys Respons 910' },
    { testCode: 'CHEM-BASIC', categoryCode: 'CHEM', testNameAr: 'لوحة الكيمياء الأساسية', testNameEn: 'Basic Chemistry Panel', code: 'ALT', nameAr: 'ALT', nameEn: 'ALT', value: '42', unit: 'U/L', reference: '10 - 60', flag: 'NORMAL', isCritical: false, instrument: 'Diasys Respons 910' },
    { testCode: 'PARAS-BLOOD', categoryCode: 'MICRO', testNameAr: 'طفيليات الدم', testNameEn: 'Blood Parasites', code: 'BABESIA', nameAr: 'بابيسيا', nameEn: 'Babesia', value: 'إيجابي', unit: 'qual', reference: '—', flag: 'POS', isCritical: false, instrument: 'Microscope' },
    { testCode: 'PARAS-BLOOD', categoryCode: 'MICRO', testNameAr: 'طفيليات الدم', testNameEn: 'Blood Parasites', code: 'THEILERIA', nameAr: 'ثيليريا', nameEn: 'Theileria', value: 'سلبي', unit: 'qual', reference: '—', flag: 'NEG', isCritical: false, instrument: 'Microscope' },
    { testCode: 'PARAS-STOOL', categoryCode: 'MICRO', testNameAr: 'طفيليات البراز', testNameEn: 'Stool Parasites', code: 'COCCIDIA', nameAr: 'كوكسيديا', nameEn: 'Coccidia (Eimeria)', value: 'إيجابي', unit: 'qual', reference: '—', flag: 'POS', isCritical: false, instrument: 'Microscope' },
    { testCode: 'PARAS-STOOL', categoryCode: 'MICRO', testNameAr: 'طفيليات البراز', testNameEn: 'Stool Parasites', code: 'STRONGYLES', nameAr: 'ديدان معوية قوية', nameEn: 'Strongyles', value: 'سلبي', unit: 'qual', reference: '—', flag: 'NEG', isCritical: false, instrument: 'Microscope' },
    { testCode: 'ELISA-FMD', categoryCode: 'ELISA', testNameAr: 'إليزا الحمى القلاعية', testNameEn: 'FMD ELISA', code: 'SP-RATIO', nameAr: 'نسبة S/P', nameEn: 'S/P Ratio', value: '0.42', unit: '', reference: '> 0.3 Positive', flag: 'HIGH', isCritical: false, instrument: 'Mini VIDAS' },
  ],
  attachments: [
    { fileUrl: demoImage('مسحة الدم', 12), caption: 'مسحة الدم', testNameAr: 'طفيليات الدم', testNameEn: 'Blood Parasites' },
    { fileUrl: demoImage('Babesia', 0), caption: 'Babesia', testNameAr: 'طفيليات الدم', testNameEn: 'Blood Parasites' },
    { fileUrl: demoImage('Coccidia', 280), caption: 'Coccidia oocyst', testNameAr: 'طفيليات البراز', testNameEn: 'Stool Parasites' },
  ],
  interpretation: 'ارتفاع طفيف في WBC مع انخفاض PLT. بابيسيا إيجابية في مسحة الدم. كوكسيديا إيجابية في فحص البراز.',
  recommendations: '• علاج مضاد للطفيليات حسب البروتوكول السريري\n• إعادة CBC خلال 72 ساعة\n• عزل الحيوان ومراقبة الحالة العامة',
  doctorNotes: null,
  approvals: {
    lab: { approved: true, name: 'د. فاطمة الزهراني', approvedAt: '2026-06-15T14:00:00Z' },
    vet: { approved: true, name: 'د. خالد المنصور', approvedAt: '2026-06-15T14:25:00Z' },
  },
  generatedBy: 'نظام LIMS',
};
