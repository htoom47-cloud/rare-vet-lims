/** Sample report data for preview / demo without backend */
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
    name: 'Rare Animals Veterinary Care Center',
    nameAr: 'مركز رعاية النوادر البيطري',
    subtitle: 'Veterinary Medical & Research Laboratory',
    subtitleAr: 'للتحاليل الطبية والبحثية البيطرية',
    address: 'المملكة العربية السعودية',
    phone: '+966539779328',
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
    type: 'Blood — EDTA',
    collectionDate: '2026-06-14T09:15:00Z',
    receivedDate: '2026-06-14T10:45:00Z',
    condition: 'Acceptable',
    collectedBy: 'سارة الحربي',
  },
  results: [
    { testCode: 'CBC', code: 'WBC', nameAr: 'كريات الدم البيضاء', nameEn: 'White Blood Cells', value: '12.4', unit: '10³/µL', reference: '6.0 - 12.0', flag: 'HIGH', isCritical: false, method: 'Automated', instrument: 'Norma Icon' },
    { testCode: 'CBC', code: 'RBC', nameAr: 'كريات الدم الحمراء', nameEn: 'Red Blood Cells', value: '7.8', unit: '10⁶/µL', reference: '7.0 - 12.0', flag: 'NORMAL', isCritical: false, method: 'Automated', instrument: 'Norma Icon' },
    { testCode: 'CBC', code: 'HGB', nameAr: 'الهيموجلوبين', nameEn: 'Hemoglobin', value: '11.2', unit: 'g/dL', reference: '11.0 - 16.0', flag: 'NORMAL', isCritical: false, method: 'Automated', instrument: 'Norma Icon' },
    { testCode: 'CBC', code: 'HCT', nameAr: 'الهematocrit', nameEn: 'Hematocrit', value: '32.1', unit: '%', reference: '30.0 - 45.0', flag: 'NORMAL', isCritical: false, method: 'Automated', instrument: 'Norma Icon' },
    { testCode: 'CBC', code: 'PLT', nameAr: 'الصفائح الدموية', nameEn: 'Platelets', value: '98', unit: '10³/µL', reference: '150 - 400', flag: 'LOW', isCritical: false, method: 'Automated', instrument: 'Norma Icon' },
    { testCode: 'CHEM', code: 'GLU', nameAr: 'الجلوكوز', nameEn: 'Glucose', value: '285', unit: 'mg/dL', reference: '70 - 120', flag: 'CRIT_HIGH', isCritical: true, method: 'Enzymatic', instrument: 'Diasys Respons 910' },
    { testCode: 'CHEM', code: 'BUN', nameAr: 'نيتروجين اليوريا', nameEn: 'Blood Urea Nitrogen', value: '38', unit: 'mg/dL', reference: '10 - 30', flag: 'HIGH', isCritical: false, method: 'Urease-GLDH', instrument: 'Diasys Respons 910' },
    { testCode: 'CHEM', code: 'CREA', nameAr: 'الكreatinine', nameEn: 'Creatinine', value: '1.4', unit: 'mg/dL', reference: '0.8 - 2.0', flag: 'NORMAL', isCritical: false, method: 'Jaffe', instrument: 'Diasys Respons 910' },
    { testCode: 'IMM', code: 'SAA', nameAr: 'بروtein الأمiloide A', nameEn: 'Serum Amyloid A', value: '45', unit: 'mg/L', reference: '0 - 10', flag: 'HIGH', isCritical: false, method: 'ELISA', instrument: 'Mini VIDAS' },
  ],
  interpretation: `تُظهر نتائج CBC ارتفاعاً طفيفاً في كريات الدم البيضاء مع انخفاض في الصفائح الدموية، مما قد يشير إلى استجابة التهابية أو إجهاد نخاعي.

ارتفاع الجلوكوز بشكل حرج (285 mg/dL) يستدعي تقييماً سريرياً فورياً لاستبعاد السكري أو الإجهاد الحاد.

ارتفاع BUN مع SAA يدعم وجود التهاب/systemic response — يُنصح بربط النتائج بالفحص السريري والتاريخ المرضي.`,
  recommendations: `• إعادة فحص الجلوكوز والـ CBC خلال 48-72 ساعة
• فحص بول شامل (UA) و culture إذا استمرت الأعراض
• مراقبة hydration status و electrolytes
• العلاج المقترح: يُحدد من قبل الطبيب المعالج بناءً على التشخيص السريري
• متابعة الصفائح الدموية — إذا انخفضت تحت 50 يُنصح بالتنويم`,
  doctorNotes: null,
  approvals: {
    lab: { approved: true, name: 'د. فاطمة الزهراني', approvedAt: '2026-06-15T14:00:00Z' },
    vet: { approved: true, name: 'د. خالد المنصور', approvedAt: '2026-06-15T14:25:00Z' },
  },
  generatedBy: 'نظام LIMS',
};
