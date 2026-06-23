/** When to use ultra-compact single A4 page (CBC and similar routine panels). */
const SINGLE_PAGE_MAX_ROWS = 34;

const isAbnormalFlag = (flag) => flag && !['NORMAL', 'NEG', 'PENDING'].includes(flag);

const shouldUseSinglePageLayout = (reportData) => {
  const results = reportData?.results || [];
  const attachments = reportData?.attachments || [];
  const notes = String(reportData?.treatmentRecommendations || '').trim();
  if (attachments.length > 0) return false;
  if (notes.length > 100) return false;
  return results.length > 0 && results.length <= SINGLE_PAGE_MAX_ROWS;
};

module.exports = { SINGLE_PAGE_MAX_ROWS, isAbnormalFlag, shouldUseSinglePageLayout };
