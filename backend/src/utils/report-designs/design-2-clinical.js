/**
 * Clinical intelligence for premium report (design 2) — IDEXX-style sections.
 */
const { isAbnormalFlag } = require('./layout-mode');

const PHRASES = {
  WBC: {
    high: { en: 'Markedly elevated white blood cell count', ar: 'ارتفاع شديد في كريات الدم البيضاء', icon: 'high' },
    low: { en: 'Leukopenia', ar: 'انخفاض كريات الدم البيضاء', icon: 'low' },
  },
  LYM: {
    high: { en: 'Lymphocytosis', ar: 'ارتفاع اللمفاويات', icon: 'high' },
    low: { en: 'Lymphopenia', ar: 'انخفاض اللمفاويات', icon: 'low' },
  },
  MON: {
    high: { en: 'Monocytosis', ar: 'ارتفاع الوحيدات', icon: 'high' },
    low: { en: 'Monocytopenia', ar: 'انخفاض الوحيدات', icon: 'low' },
  },
  NEU: {
    high: { en: 'Neutrophilia', ar: 'ارتفاع العدلات', icon: 'high' },
    low: { en: 'Neutropenia', ar: 'انخفاض العدلات', icon: 'low' },
  },
  EOS: {
    high: { en: 'Eosinophilia', ar: 'ارتفاع الحمضات', icon: 'high' },
    low: { en: 'Eosinopenia', ar: 'انخفاض الحمضات', icon: 'low' },
  },
  BAS: {
    high: { en: 'Basophilia', ar: 'ارتفاع القعدات', icon: 'high' },
    low: { en: 'Basopenia', ar: 'انخفاض القعدات', icon: 'low' },
  },
  RBC: {
    high: { en: 'Polycythemia', ar: 'ارتفاع كريات الدم الحمراء', icon: 'high' },
    low: { en: 'Low red blood cell count', ar: 'انخفاض كريات الدم الحمراء', icon: 'low' },
  },
  HGB: {
    high: { en: 'Elevated hemoglobin', ar: 'ارتفاع الهيموجلوبين', icon: 'high' },
    low: { en: 'Decreased hemoglobin', ar: 'انخفاض الهيموجلوبين', icon: 'low' },
  },
  HCT: {
    high: { en: 'Elevated hematocrit', ar: 'ارتفاع الهيماتوكريت', icon: 'high' },
    low: { en: 'Low hematocrit', ar: 'انخفاض الهيماتوكريت', icon: 'low' },
  },
  MCV: {
    high: { en: 'Macrocytosis', ar: 'تضخم كريات الدم الحمراء', icon: 'high' },
    low: { en: 'Microcytosis', ar: 'صغر كريات الدم الحمراء', icon: 'low' },
  },
  PLT: {
    high: { en: 'Thrombocytosis', ar: 'ارتفاع الصفائح الدموية', icon: 'high' },
    low: { en: 'Thrombocytopenia', ar: 'نقص الصفائح الدموية', icon: 'low' },
  },
  MPV: {
    high: { en: 'Increased mean platelet volume', ar: 'ارتفاع حجم الصفائح الوسطي', icon: 'high' },
    low: { en: 'Decreased mean platelet volume', ar: 'انخفاض حجم الصفائح الوسطي', icon: 'low' },
  },
  GLU: {
    high: { en: 'Hyperglycemia', ar: 'ارتفاع مستوى السكر', icon: 'high' },
    low: { en: 'Hypoglycemia', ar: 'انخفاض مستوى السكر', icon: 'low' },
  },
  BUN: {
    high: { en: 'Elevated BUN', ar: 'ارتفاع نيتروجين اليوريا', icon: 'high' },
    low: { en: 'Low BUN', ar: 'انخفاض نيتروجين اليوريا', icon: 'low' },
  },
  CREA: {
    high: { en: 'Elevated creatinine', ar: 'ارتفاع الكرياتininin', icon: 'high' },
    low: { en: 'Low creatinine', ar: 'انخفاض الكرياتininin', icon: 'low' },
  },
};

const isHigh = (flag) => flag === 'HIGH' || flag === 'CRIT_HIGH' || flag === 'POS';
const isLow = (flag) => flag === 'LOW' || flag === 'CRIT_LOW';

const phraseFor = (row, lang) => {
  const code = String(row.code || '').toUpperCase();
  const entry = PHRASES[code] || PHRASES[code.replace(/-/g, '_')];
  const isAr = lang === 'ar';

  if (entry) {
    if (isHigh(row.flag) && entry.high) {
      return { text: isAr ? entry.high.ar : entry.high.en, icon: 'high' };
    }
    if (isLow(row.flag) && entry.low) {
      return { text: isAr ? entry.low.ar : entry.low.en, icon: 'low' };
    }
  }

  const name = isAr ? (row.nameAr || row.nameEn || row.code) : (row.nameEn || row.nameAr || row.code);
  if (isHigh(row.flag)) {
    return { text: isAr ? `ارتفاع ${name}` : `Elevated ${name}`, icon: 'high' };
  }
  if (isLow(row.flag)) {
    return { text: isAr ? `انخفاض ${name}` : `Low ${name}`, icon: 'low' };
  }
  return null;
};

const buildResultCounts = (results = []) => {
  let high = 0;
  let low = 0;
  let normal = 0;
  results.forEach((r) => {
    if (isHigh(r.flag)) high += 1;
    else if (isLow(r.flag)) low += 1;
    else normal += 1;
  });
  return { high, low, normal, total: results.length };
};

const buildClinicalSummary = (results, lang = 'ar') => {
  const abnormal = (results || []).filter((r) => isAbnormalFlag(r.flag));
  const items = abnormal.map((r) => phraseFor(r, lang)).filter(Boolean);
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  });
};

const pickCodes = (results, pred) => results.filter((r) => pred(r.flag)).map((r) => String(r.code || '').toUpperCase());

const buildStructuredInterpretation = (results, lang = 'ar', manualText = '') => {
  const isAr = lang === 'ar';
  const abnormal = (results || []).filter((r) => isAbnormalFlag(r.flag));
  const codes = abnormal.map((r) => String(r.code || '').toUpperCase());
  const hasHighWbc = codes.some((c) => ['WBC', 'NEU', 'MON'].includes(c) && abnormal.find((r) => r.code === c && isHigh(r.flag)));
  const hasLowRbc = codes.some((c) => ['RBC', 'HGB', 'HCT'].includes(c) && abnormal.find((r) => r.code === c && isLow(r.flag)));
  const hasLowPlt = codes.some((c) => c === 'PLT' && abnormal.find((r) => r.code === c && isLow(r.flag)));
  const hasRenal = codes.some((c) => ['BUN', 'CREA'].includes(c));
  const hasGlu = codes.includes('GLU');

  if (!abnormal.length) {
    return {
      diagnosisSuggestion: isAr
        ? 'النتائج ضمن المعدلات المرجعية — لا توجد دلائل مخبرية على اضطراب حاد.'
        : 'Results within reference intervals — no acute laboratory evidence of disorder.',
      possibleCauses: isAr
        ? ['حالة فسيولوجية طبيعية', 'تغيرات فسيولوجية عابرة']
        : ['Physiological variation', 'Transient physiological change'],
      recommendedTests: isAr
        ? ['لا يلزم فحص إضافي عاجل — المتابعة السريرية']
        : ['No urgent add-on testing — clinical monitoring'],
      recommendations: manualText || (isAr
        ? 'ربط النتائج بالفحص السريري. إعادة التقييم عند ظهور أعراض.'
        : 'Correlate with clinical examination. Reassess if clinical signs develop.'),
    };
  }

  const parts = [];
  if (hasHighWbc) parts.push(isAr ? 'استجابة التهابية/عدوى محتملة' : 'Possible inflammatory/infectious response');
  if (hasLowRbc) parts.push(isAr ? 'فقر دم محتمل' : 'Possible anemia');
  if (hasLowPlt) parts.push(isAr ? 'نقص صفائح محتمل' : 'Possible thrombocytopenia');
  if (hasRenal) parts.push(isAr ? 'اضطراب وظائف كلوية محتمل' : 'Possible renal involvement');
  if (hasGlu) parts.push(isAr ? 'اضطراب استقلاب سكر محتمل' : 'Possible glucose dysregulation');

  const diagnosisSuggestion = isAr
    ? `تشير النتائج إلى: ${parts.join('، ')}.`
    : `Findings suggest: ${parts.join('; ')}.`;

  const possibleCauses = [];
  if (hasHighWbc) {
    possibleCauses.push(
      ...(isAr
        ? ['عدوى بكتيرية أو فيروسية', 'التهاب أو إجهاد', 'استجابة مناعية']
        : ['Bacterial or viral infection', 'Inflammation or stress', 'Immune-mediated response'])
    );
  }
  if (hasLowRbc) {
    possibleCauses.push(
      ...(isAr
        ? ['فقد دم', 'نقص حديد/تغذية', 'مرض مزمن']
        : ['Blood loss', 'Nutritional/iron deficiency', 'Chronic disease'])
    );
  }
  if (hasLowPlt) {
    possibleCauses.push(
      ...(isAr
        ? ['استهلاك صفائح', 'قصور نخاع العظم', 'تجلط منتشر']
        : ['Platelet consumption', 'Bone marrow suppression', 'DIC'])
    );
  }
  if (!possibleCauses.length) {
    possibleCauses.push(isAr ? 'تغيرات مرضية متعددة — يلزم ربط سريري' : 'Multifactorial — clinical correlation required');
  }

  const recommendedTests = [];
  if (hasHighWbc || hasLowPlt) {
    recommendedTests.push(isAr ? 'مسحة دم/فيلم دموي' : 'Blood smear review');
  }
  if (hasLowRbc) {
    recommendedTests.push(isAr ? 'كيمياء دم (حديد، B12، فولات)' : 'Biochemistry (iron, B12, folate)');
  }
  if (hasRenal) {
    recommendedTests.push(isAr ? 'SDMA / تحليل بول' : 'SDMA / urinalysis');
  }
  if (hasHighWbc) {
    recommendedTests.push(isAr ? 'PCR أو مزرعة حسب السياق السريري' : 'PCR or culture as clinically indicated');
  }
  if (!recommendedTests.length) {
    recommendedTests.push(isAr ? 'إعادة CBC خلال 48–72 ساعة' : 'Repeat CBC in 48–72 hours');
  }

  const recommendations = manualText || (isAr
    ? 'المتابعة السريرية ضرورية. يُوصى بمراجعة الطبيب المعالج لربط النتائج بالأعراض واتخاذ قرار علاجي مناسب.'
    : 'Clinical follow-up is essential. Review with the attending veterinarian to correlate findings with signs and plan treatment.');

  return {
    diagnosisSuggestion: diagnosisSuggestion.replace('النتائje', 'النتائج'),
    possibleCauses: [...new Set(possibleCauses)].slice(0, 5),
    recommendedTests: [...new Set(recommendedTests)].slice(0, 4),
    recommendations,
  };
};

const resolveStructuredInterpretation = (reportData) => {
  const manual = String(
    reportData.aiInterpretation
    || reportData.clinicalInterpretation
    || ''
  ).trim();
  const recManual = String(reportData.treatmentRecommendations || '').trim();
  const structured = buildStructuredInterpretation(
    reportData.results || [],
    reportData.language || 'ar',
    recManual || manual
  );
  if (manual && !recManual) {
    structured.recommendations = manual;
  }
  return structured;
};

module.exports = {
  buildResultCounts,
  buildClinicalSummary,
  buildStructuredInterpretation,
  resolveStructuredInterpretation,
  phraseFor,
};
