const FLAG_TEXT = {
  ar: {
    NORMAL: 'ضمن المعدل الطبيعي',
    HIGH: 'أعلى من المعدل الطبيعي',
    LOW: 'أقل من المعدل الطبيعي',
    CRIT_HIGH: 'مرتفع بشكل حرج',
    CRIT_LOW: 'منخفض بشكل حرج',
  },
  en: {
    NORMAL: 'within normal range',
    HIGH: 'above normal range',
    LOW: 'below normal range',
    CRIT_HIGH: 'critically high',
    CRIT_LOW: 'critically low',
  },
};

const ANIMAL_LABELS = {
  ar: { camel: 'الإبل', horse: 'الخيول', sheep: 'الأغنام', goat: 'الماعز', bird: 'الطيور', cat: 'القطط', dog: 'الكلاب' },
  en: { camel: 'camels', horse: 'horses', sheep: 'sheep', goat: 'goats', bird: 'birds', cat: 'cats', dog: 'dogs' },
};

const generateInterpretation = (results, language = 'ar', animalType = 'camel') => {
  const isArabic = language === 'ar';
  const flags = FLAG_TEXT[isArabic ? 'ar' : 'en'];
  const animal = ANIMAL_LABELS[isArabic ? 'ar' : 'en'][animalType] || animalType;

  const abnormal = (results || []).filter((r) => r.flag && r.flag !== 'NORMAL');
  const critical = abnormal.filter((r) => r.isCritical || r.flag?.startsWith('CRIT'));

  if (!abnormal.length) {
    return isArabic
      ? `بناءً على تحليل نتائج الفحوصات المخبرية إلكترونياً، تُظهر جميع القيم المقاسة أنها ضمن المعدلات المرجعية الطبيعية ل${animal}. لا توجد انحرافات مخبرية ظاهرة تستدعي قلقاً فورياً. يُنصح بالمتابعة الدورية حسب الحالة السريرية.`
      : `Based on automated laboratory analysis, all measured values are within normal reference ranges for ${animal}. No significant laboratory deviations are observed. Routine clinical follow-up is recommended as appropriate.`;
  }

  const lines = abnormal.map((r) => {
    const status = flags[r.flag] || r.flag;
    return isArabic
      ? `• ${r.name}: القيمة ${r.value} ${r.unit || ''} (${status}) — المدى المرجعي ${r.reference}`
      : `• ${r.name}: value ${r.value} ${r.unit || ''} (${status}) — reference ${r.reference}`;
  });

  const intro = isArabic
    ? `تفسير إلكتروني لنتائج المختبر (${animal}):\n\n`
    : `Automated laboratory interpretation (${animal}):\n\n`;

  const summary = isArabic
    ? (critical.length
      ? `ملخص: وُجدت ${abnormal.length} قيمة خارج المعدل الطبيعي، منها ${critical.length} قيمة حرجة تستدعي تقييماً بيطرياً عاجلاً.`
      : `ملخص: وُجدت ${abnormal.length} قيمة خارج المعدل الطبيعي دون قيم حرجة حالياً.`)
    : (critical.length
      ? `Summary: ${abnormal.length} value(s) are outside normal range, including ${critical.length} critical finding(s) requiring urgent veterinary assessment.`
      : `Summary: ${abnormal.length} value(s) are outside normal range with no critical flags at this time.`);

  const disclaimer = isArabic
    ? '\n\nملاحظة: هذا التفسير مُولَّد إلكترونياً لدعم الطبيب البيطري ولا يُغني عن الفحص السريري والتشخيص النهائي.'
    : '\n\nNote: This interpretation is electronically generated to support the veterinarian and does not replace clinical examination or final diagnosis.';

  return `${intro}${lines.join('\n')}\n\n${summary}${disclaimer}`;
};

module.exports = { generateInterpretation };
