/**
 * Preliminary report eligibility — pure helpers (no DB).
 * Gated by PRELIMINARY_REPORTS_ENABLED (default off).
 */

const resolveGenerateMode = ({ flagEnabled, completed, hasValidated, pendingCount }) => {
  if (completed && hasValidated) return 'final';
  if (flagEnabled && hasValidated && Number(pendingCount) > 0) return 'preliminary';
  return null;
};

/** Reuse the latest report unless we must issue a new final after a preliminary. */
const shouldReuseExistingReport = ({ forceRegenerate, mode, existingIsFinal }) => {
  if (forceRegenerate) return false;
  if (existingIsFinal == null) return false;
  if (mode === 'final' && existingIsFinal === false) return false;
  return true;
};

const pendingTestLabel = (row, language = 'ar') => {
  if (language === 'ar') {
    return row.test_name_ar || row.test_name || row.test_code || '';
  }
  return row.test_name || row.test_name_ar || row.test_code || '';
};

module.exports = {
  resolveGenerateMode,
  shouldReuseExistingReport,
  pendingTestLabel,
};
