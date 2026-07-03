/** Pure helpers for smart report lifecycle (no DB / env side effects). */

const UPDATE_REASONS = {
  RESULTS: {
    en: 'Results were modified after the report was generated',
    ar: 'تم تعديل النتائج بعد إنشاء التقرير',
  },
  VALIDATION: {
    en: 'Validation status changed after the report was generated',
    ar: 'تغيّرت حالة اعتماد النتائج بعد إنشاء التقرير',
  },
  SAMPLE: {
    en: 'Sample data was updated after the report was generated',
    ar: 'تم تحديث بيانات العينة بعد إنشاء التقرير',
  },
  ANIMAL: {
    en: 'Animal data was updated after the report was generated',
    ar: 'تم تحديث بيانات الحيوان بعد إنشاء التقرير',
  },
  CUSTOMER: {
    en: 'Customer data was updated after the report was generated',
    ar: 'تم تحديث بيانات العميل بعد إنشاء التقرير',
  },
  ATTACHMENTS: {
    en: 'Report images were updated after the report was generated',
    ar: 'تم تحديث صور التقرير بعد إنشاء التقرير',
  },
  APPROVAL: {
    en: 'Approvals were updated after the report was generated',
    ar: 'تم تحديث الاعتمادات بعد إنشاء التقرير',
  },
  REFERENCE: {
    en: 'Reference ranges were updated after the report was generated',
    ar: 'تم تحديث القيم المرجعية بعد إنشاء التقرير',
  },
};

const toMillis = (value) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const reasonText = (key, language = 'ar') => {
  const entry = UPDATE_REASONS[key];
  if (!entry) return null;
  return language === 'en' ? entry.en : entry.ar;
};

const detectStaleSources = (sources, lastGeneratedAt) => {
  const baseline = toMillis(lastGeneratedAt);
  const stale = [];

  const pushIfNewer = (key, ts) => {
    if (toMillis(ts) > baseline) {
      stale.push({ key, at: ts, reason: UPDATE_REASONS[key] });
    }
  };

  pushIfNewer('RESULTS', sources.resultsUpdatedAt);
  pushIfNewer('VALIDATION', sources.validationAt);
  pushIfNewer('SAMPLE', sources.sampleUpdatedAt);
  pushIfNewer('ANIMAL', sources.animalUpdatedAt);
  pushIfNewer('CUSTOMER', sources.customerUpdatedAt);
  pushIfNewer('ATTACHMENTS', sources.attachmentsAt);
  pushIfNewer('APPROVAL', sources.approvalAt);
  pushIfNewer('REFERENCE', sources.referenceAt);

  stale.sort((a, b) => toMillis(b.at) - toMillis(a.at));
  return stale;
};

const isFeatureEnabled = (rawFlag) => rawFlag === 'true' || rawFlag === true;

module.exports = {
  UPDATE_REASONS,
  toMillis,
  reasonText,
  detectStaleSources,
  isFeatureEnabled,
};
