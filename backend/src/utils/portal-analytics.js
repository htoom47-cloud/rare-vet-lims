const PANELS = [
  { key: 'cbc', codes: ['CBC'] },
  { key: 'chem', codes: ['CHEM'] },
  { key: 'hormones', codes: ['HORM'] },
  // MICRO includes Brucella Rose Bengal (qualitative infectious screening)
  { key: 'infectious', codes: ['ELISA', 'SERO', 'PCR', 'CULT', 'MICRO'] },
  { key: 'parasitology', codes: ['PARAS'] },
  { key: 'reproduction', codes: [] },
];

const isPositiveValue = (value) => /^(positive|إيجابي|\+|pos|yes|نعم)$/i.test(String(value || '').trim());
const isNegativeValue = (value) => /^(negative|سلبي|\-|neg|no|لا)$/i.test(String(value || '').trim());

/** Prefer stored flag; infer POS/NEG from display value when flag was stripped. */
const effectiveFlag = (row = {}) => {
  const flag = String(row.flag || '').trim();
  if (flag) return flag;
  if (isPositiveValue(row.value) || isPositiveValue(row.displayValue)) return 'POS';
  if (isNegativeValue(row.value) || isNegativeValue(row.displayValue)) return 'NEG';
  return '';
};

const flagSeverity = (flag) => {
  if (!flag || ['NORMAL', 'NEG', 'PENDING', ''].includes(flag)) return 0;
  if (String(flag).startsWith('CRIT')) return 3;
  if (['HIGH', 'LOW', 'H', 'L', 'POS'].includes(flag)) return 2;
  return 1;
};

const panelStatusFromResults = (results, codes) => {
  const detail = panelDetailFromResults(results, { codes });
  return detail.status;
};

const panelDetailFromResults = (results, { codes, key }) => {
  const rows = (results || []).filter((r) => codes.includes(r.categoryCode));
  if (!rows.length) {
    return {
      key,
      status: 'none',
      total: 0,
      abnormal: 0,
      attention: 0,
      normal: 0,
      critical: 0,
    };
  }
  let abnormal = 0;
  let attention = 0;
  let critical = 0;
  for (const row of rows) {
    const sev = flagSeverity(effectiveFlag(row));
    if (sev >= 3) critical += 1;
    if (sev >= 2) abnormal += 1;
    else if (sev === 1) attention += 1;
  }
  const normal = rows.length - abnormal - attention;
  let status = 'normal';
  if (abnormal > 0) status = 'abnormal';
  else if (attention > 0) status = 'attention';

  return {
    key,
    status,
    total: rows.length,
    abnormal,
    attention,
    normal,
    critical,
  };
};

const buildPanelDetails = (results) =>
  PANELS.map((panel) => panelDetailFromResults(results, panel));

const summarizeResults = (results) => {
  const rows = results || [];
  let abnormal = 0;
  let attention = 0;
  let critical = 0;
  let normal = 0;
  for (const row of rows) {
    const sev = flagSeverity(effectiveFlag(row));
    if (sev >= 3) critical += 1;
    if (sev >= 2) abnormal += 1;
    else if (sev === 1) attention += 1;
    else normal += 1;
  }
  let overallStatus = 'unknown';
  if (rows.length) {
    if (abnormal > 0) overallStatus = 'abnormal';
    else if (attention > 0) overallStatus = 'attention';
    else overallStatus = 'normal';
  }
  return {
    total: rows.length,
    abnormal,
    attention,
    normal,
    critical,
    overallStatus,
  };
};

const pctChange = (current, previous) => {
  if (current == null || previous == null || Number.isNaN(current) || Number.isNaN(previous)) return null;
  if (Math.abs(previous) < 0.0001) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
};

const enrichParameters = (parameters, previews) => {
  return parameters.map((param) => {
    const nums = param.values
      .map((v) => v.numericValue)
      .filter((n) => n != null && !Number.isNaN(n));
    const current = nums.length ? nums[nums.length - 1] : null;
    const previous = nums.length >= 2 ? nums[nums.length - 2] : null;
    const change = pctChange(current, previous);
    const latestFlag = effectiveFlag(param.values[param.values.length - 1] || {});
    return {
      ...param,
      current,
      previous,
      percentChange: change,
      latestFlag: latestFlag || null,
    };
  });
};

const buildInterpretation = (parameters, panels, isArabic) => {
  const lines = [];
  const abnormal = parameters.filter((p) => flagSeverity(p.latestFlag) >= 2);
  const improved = parameters.filter((p) => p.percentChange != null && p.percentChange > 8 && flagSeverity(p.latestFlag) <= 1);
  const worsened = parameters.filter((p) => p.percentChange != null && p.percentChange > 10 && flagSeverity(p.latestFlag) >= 2);

  if (isArabic) {
    if (improved.length) {
      const p = improved[0];
      lines.push(
        `لوحظ تحسن في ${p.nameAr || p.nameEn} بنسبة ${Math.abs(p.percentChange)}% مقارنة بالتحليل السابق.`
      );
    }
    if (worsened.length) {
      lines.push('هناك مؤشرات خارج المعدل الطبيعي مع اتجاه تصاعدي ويُنصح بمتابعة بيطرية.');
    }
    if (abnormal.length && !worsened.length) {
      lines.push(`توجد ${abnormal.length} نتيجة خارج النطاق المرجعي في آخر تقرير.`);
    }
    const badPanels = panels.filter((p) => p.status === 'abnormal');
    if (badPanels.length) {
      lines.push('يُوصى بمراجعة الأخصائي لمتابعة الحالة الصحية للحيوان.');
    }
    if (!lines.length) {
      lines.push('النتائج الأخيرة ضمن الحدود المرجعية بشكل عام مع استقرار ملحوظ مقارنة بالزيارات السابقة.');
    }
  } else {
    if (improved.length) {
      const p = improved[0];
      lines.push(
        `Improvement noted in ${p.nameEn || p.nameAr} by ${Math.abs(p.percentChange)}% versus the previous test.`
      );
    }
    if (worsened.length) {
      lines.push('Some markers remain out of range with an upward trend; veterinary follow-up is advised.');
    }
    if (abnormal.length && !worsened.length) {
      lines.push(`${abnormal.length} result(s) are outside the reference range on the latest report.`);
    }
    if (!lines.length) {
      lines.push('Recent results are generally within reference limits with stable trends over prior visits.');
    }
  }

  return lines.join(' ');
};

module.exports = {
  PANELS,
  panelStatusFromResults,
  panelDetailFromResults,
  buildPanelDetails,
  summarizeResults,
  enrichParameters,
  buildInterpretation,
  pctChange,
  flagSeverity,
  effectiveFlag,
};
