/** Single A4 page layout for routine CBC-style reports (matches backend layout-mode.js). */
export const SINGLE_PAGE_MAX_ROWS = 34;

export const isAbnormalFlag = (flag) => flag && !['NORMAL', 'NEG', 'PENDING'].includes(flag);

export const isSinglePageLayout = (report) => {
  if (!report) return false;
  const n = report.results?.length || 0;
  const imgs = report.attachments?.length || 0;
  const notes = String(report.recommendations || report.interpretation || '').trim();
  if (imgs > 0) return false;
  if (notes.length > 100) return false;
  return n > 0 && n <= SINGLE_PAGE_MAX_ROWS;
};

export const flattenResults = (groups) => groups.flatMap((g) => g.items);
