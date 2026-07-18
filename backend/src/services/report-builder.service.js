/**
 * Dynamic Report Builder — sections driven by ordered tests + validated results + reportable images.
 *
 * PDF (active design) and Preview both consume the same `sections` array from buildReportSections().
 */
const SECTION_META = {
  hematology: {
    titleEn: 'Hematology Report',
    titleAr: 'صورة الدم',
    sortOrder: 1,
    categoryCodes: ['CBC', 'HEM', 'HEMATO'],
  },
  chemistry: {
    titleEn: 'Chemistry Report',
    titleAr: 'كيمياء الدم',
    sortOrder: 2,
    categoryCodes: ['CHEM', 'BIOCHEM'],
  },
  blood_parasites: {
    titleEn: 'Blood Parasites',
    titleAr: 'طفيليات الدم',
    sortOrder: 3,
    categoryCodes: ['PARAS'],
    testCodePatterns: [/PARAS-BLOOD|BLOOD-PARAS|PARAS-B/i],
  },
  fecal: {
    titleEn: 'Fecal Analysis',
    titleAr: 'فحص البراز',
    sortOrder: 4,
    categoryCodes: ['PARAS', 'MICRO'],
    testCodePatterns: [/PARAS-STOOL|FECAL|STOOL|PARAS-F/i],
  },
  hormones: {
    titleEn: 'Hormones',
    titleAr: 'الهرمونات',
    sortOrder: 5,
    categoryCodes: ['HORM'],
  },
  elisa: {
    titleEn: 'ELISA Technique',
    titleAr: 'تقنية إليزا',
    sortOrder: 6,
    categoryCodes: ['ELISA'],
  },
  serology: {
    titleEn: 'Serology',
    titleAr: 'المصلية',
    sortOrder: 7,
    categoryCodes: ['SERO', 'IMMUNO'],
  },
  pcr: {
    titleEn: 'PCR',
    titleAr: 'PCR',
    sortOrder: 8,
    categoryCodes: ['PCR'],
  },
  microscopy: {
    titleEn: 'Microscopy / Parasite Images',
    titleAr: 'صور الميكروسكوب / الطفيليات',
    sortOrder: 9,
    isImageSection: true,
  },
  comparison: {
    titleEn: 'Comparison Report',
    titleAr: 'تقرير المقارنة',
    sortOrder: 10,
    isComparisonSection: true,
  },
  other: {
    titleEn: 'Laboratory Results',
    titleAr: 'نتائج المختبر',
    sortOrder: 99,
  },
};

const SECTION_ORDER = Object.fromEntries(
  Object.entries(SECTION_META).map(([key, meta]) => [key, meta.sortOrder ?? 99])
);

const resolveSectionType = (testCode, categoryCode) => {
  const code = String(testCode || '').toUpperCase();
  const cat = String(categoryCode || '').toUpperCase();

  if (/^CBC/.test(code) || ['CBC', 'HEM', 'HEMATO'].includes(cat)) return 'hematology';
  if (/^CHEM/.test(code) || ['CHEM', 'BIOCHEM'].includes(cat)) return 'chemistry';
  if (/PARAS-BLOOD|BLOOD-PARAS|PARAS-B/.test(code)) return 'blood_parasites';
  if (/PARAS-STOOL|FECAL|STOOL|PARAS-F/.test(code)) return 'fecal';
  if (/^HORM/.test(code) || cat === 'HORM') return 'hormones';
  if (cat === 'ELISA' || /ELISA/i.test(code)) return 'elisa';
  if (['SERO', 'IMMUNO'].includes(cat) || /^SERO/.test(code)) return 'serology';
  if (/PCR/.test(code) || cat === 'PCR') return 'pcr';
  return 'other';
};

const hasResultValue = (row) => {
  const v = row?.value ?? row?.numericValue;
  return v != null && String(v).trim() !== '' && String(v).trim() !== '-';
};

const isReportableAttachment = (att) => (
  att != null
  && att.file_url
  && att.include_in_report !== false
);

const filterReportableAttachments = (attachments = []) => (
  attachments.filter(isReportableAttachment)
);

const createEmptySection = (type, language = 'ar') => {
  const meta = SECTION_META[type] || SECTION_META.other;
  const isAr = language === 'ar';
  return {
    sectionType: type,
    titleEn: meta.titleEn,
    titleAr: meta.titleAr,
    title: isAr ? meta.titleAr : meta.titleEn,
    sortOrder: meta.sortOrder ?? SECTION_ORDER.other,
    isImageSection: !!meta.isImageSection,
    isComparisonSection: !!meta.isComparisonSection,
    results: [],
    attachments: [],
    testCodes: [],
  };
};

/** Group flat result rows by section type (stable order). */
const groupResultsBySection = (results = [], context = {}) => {
  const language = context.language || 'ar';
  const grouped = new Map();

  for (const row of results || []) {
    if (!hasResultValue(row)) continue;
    const sectionType = resolveSectionType(row.testCode, row.categoryCode);
    if (!grouped.has(sectionType)) grouped.set(sectionType, createEmptySection(sectionType, language));
    const section = grouped.get(sectionType);
    section.results.push(row);
    const code = row.testCode;
    if (code && !section.testCodes.includes(code)) section.testCodes.push(code);
  }

  return [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder);
};

/** Build image-only section when reportable attachments exist. */
const buildImageSection = (attachments = [], context = {}) => {
  const reportable = filterReportableAttachments(attachments);
  if (!reportable.length) return null;

  const language = context.language || 'ar';
  const section = createEmptySection('microscopy', language);
  section.attachments = reportable;
  return section;
};

/** Approval block for preview / PDF payload (design unchanged). */
const buildApprovalSection = (report = {}) => {
  const lab = report.labApproval || report.approvals?.lab || {};
  const vet = report.vetApproval || report.approvals?.vet || {};
  return {
    lab: {
      approved: Boolean(lab.approved),
      name: lab.name || null,
      nameAr: lab.nameAr || null,
      license: lab.license || null,
      approvedAt: lab.approvedAt || null,
    },
    vet: {
      approved: Boolean(vet.approved),
      name: vet.name || null,
      nameAr: vet.nameAr || null,
      license: vet.license || null,
      approvedAt: vet.approvedAt || null,
    },
  };
};

const sectionHasContent = (section) => {
  const hasResults = (section.results || []).some(hasResultValue);
  const hasImages = (section.attachments || []).some(isReportableAttachment);
  return hasResults || hasImages;
};

/**
 * Whether a built section should appear in the report.
 * Empty sections are never shown; image sections require reportable attachments.
 */
const shouldShowSection = (section, context = {}) => {
  if (!section || !sectionHasContent(section)) return false;

  if (section.isImageSection) {
    return (section.attachments || []).some(isReportableAttachment);
  }

  const orderedTestCodes = context.orderedTestCodes || [];
  const orderedSectionTypes = context.orderedSectionTypes || [];

  if (orderedSectionTypes.length && !orderedSectionTypes.includes(section.sectionType)) {
    const hasResults = (section.results || []).some(hasResultValue);
    if (!hasResults) return false;
  }

  if (orderedTestCodes.length && section.testCodes?.length) {
    const matchesOrder = section.testCodes.some((code) => orderedTestCodes.includes(code));
    const hasResults = (section.results || []).some(hasResultValue);
    if (!matchesOrder && !hasResults) return false;
  }

  return true;
};

const collectOrderedContext = (orderedTests = []) => {
  const orderedTestCodes = [];
  const orderedSectionTypes = new Set();

  for (const test of orderedTests) {
    const code = test.test_code || test.testCode;
    if (code) orderedTestCodes.push(code);
    orderedSectionTypes.add(resolveSectionType(code, test.category_code || test.categoryCode));
  }

  return {
    orderedTestCodes,
    orderedSectionTypes: [...orderedSectionTypes],
  };
};

/**
 * Build ordered report sections from report data + context.
 * @param {object} reportData — { orderedTests, results, attachments, language, ... }
 * @param {object} context — { allowOrphanResults, report }
 */
const buildReportSections = (reportData = {}, context = {}) => {
  const {
    orderedTests = [],
    results = [],
    attachments = [],
    language = 'ar',
  } = reportData;

  const isAr = language === 'ar';
  const orderCtx = collectOrderedContext(orderedTests);
  const allowOrphanResults = context.allowOrphanResults !== false;

  const resultsByTest = new Map();
  for (const row of results || []) {
    const key = row.testCode || row.testNameEn || 'OTHER';
    if (!resultsByTest.has(key)) resultsByTest.set(key, []);
    resultsByTest.get(key).push(row);
  }

  const sectionMap = new Map();
  const ensureSection = (type) => {
    if (!sectionMap.has(type)) {
      sectionMap.set(type, createEmptySection(type, language));
    }
    return sectionMap.get(type);
  };

  for (const test of orderedTests) {
    const testCode = test.test_code || test.testCode;
    const items = (resultsByTest.get(testCode) || []).filter(hasResultValue);
    if (!items.length) continue;

    const sectionType = resolveSectionType(testCode, test.category_code || test.categoryCode);
    const section = ensureSection(sectionType);
    section.results.push(...items);
    if (testCode && !section.testCodes.includes(testCode)) section.testCodes.push(testCode);
  }

  if (allowOrphanResults) {
    for (const [testCode, items] of resultsByTest.entries()) {
      const validItems = items.filter(hasResultValue);
      if (!validItems.length) continue;
      const already = [...sectionMap.values()].some((s) => s.testCodes.includes(testCode));
      if (already) continue;
      const sectionType = resolveSectionType(testCode, validItems[0]?.categoryCode);
      const section = ensureSection(sectionType);
      section.results.push(...validItems);
      if (!section.testCodes.includes(testCode)) section.testCodes.push(testCode);
    }
  }

  const imgSection = buildImageSection(attachments, { language });
  if (imgSection) sectionMap.set('microscopy', imgSection);

  const showContext = {
    ...orderCtx,
    language,
    ...context,
  };

  const sections = [...sectionMap.values()]
    .filter((s) => shouldShowSection(s, showContext))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return sections.map((s) => ({
    ...s,
    title: isAr ? s.titleAr : s.titleEn,
  }));
};

/** Flatten section results for legacy consumers (flags, overview counts). */
const flattenSectionResults = (sections) => (
  (sections || []).flatMap((s) => s.results || [])
);

/** Compact signature for PDF / Preview consistency checks. */
const extractSectionSignature = (sections = []) => (
  (sections || []).map((s) => ({
    sectionType: s.sectionType,
    titleEn: s.titleEn,
    titleAr: s.titleAr,
    sortOrder: s.sortOrder,
    resultCount: (s.results || []).filter(hasResultValue).length,
    attachmentCount: (s.attachments || []).filter(isReportableAttachment).length,
    isImageSection: !!s.isImageSection,
  }))
);

const compareSectionSignatures = (a, b) => {
  const sigA = extractSectionSignature(a);
  const sigB = extractSectionSignature(b);
  return JSON.stringify(sigA) === JSON.stringify(sigB);
};

module.exports = {
  SECTION_META,
  SECTION_ORDER,
  resolveSectionType,
  hasResultValue,
  isReportableAttachment,
  filterReportableAttachments,
  groupResultsBySection,
  buildImageSection,
  buildApprovalSection,
  shouldShowSection,
  buildReportSections,
  flattenSectionResults,
  extractSectionSignature,
  compareSectionSignatures,
};
