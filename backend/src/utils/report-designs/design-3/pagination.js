/**
 * Measure printable layout in Puppeteer (print media) to drive pagination hints.
 * Uses actual rendered heights — no fixed row counts.
 */

const MM_TO_PX = 96 / 25.4;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_TOP_MM = 10;
const PAGE_MARGIN_BOTTOM_MM = 10;

const getPrintablePageHeightPx = () => (
  (A4_HEIGHT_MM - PAGE_MARGIN_TOP_MM - PAGE_MARGIN_BOTTOM_MM) * MM_TO_PX
);

/**
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ rowsOnFirstPage: number, totalRows: number, tableFitsFirstPage: boolean, tableBreakRowIndex: number|null, clinicalNewSheet: boolean }>}
 */
const measureTablePagination = async (page) => {
  const pageContentPx = getPrintablePageHeightPx();

  const measured = await page.evaluate((contentHeight) => {
    const reportMain = document.querySelector('.report-main');
    const rows = [...document.querySelectorAll('.results-table tbody tr')];
    if (!reportMain || !rows.length) {
      return { rowsOnFirstPage: 0, totalRows: 0 };
    }

    const origin = reportMain.getBoundingClientRect().top;
    let rowsOnFirstPage = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const bottom = rows[i].getBoundingClientRect().bottom - origin;
      if (bottom > contentHeight + 0.5) break;
      rowsOnFirstPage = i + 1;
    }

    return { rowsOnFirstPage, totalRows: rows.length };
  }, pageContentPx);

  const { rowsOnFirstPage, totalRows } = measured;
  const tableFitsFirstPage = totalRows > 0 && rowsOnFirstPage >= totalRows;

  let tableBreakRowIndex = null;
  let clinicalNewSheet = false;

  if (tableFitsFirstPage) {
    clinicalNewSheet = true;
  } else if (rowsOnFirstPage > 0 && rowsOnFirstPage < totalRows) {
    tableBreakRowIndex = rowsOnFirstPage;
  }

  return {
    rowsOnFirstPage,
    totalRows,
    tableFitsFirstPage,
    tableBreakRowIndex,
    clinicalNewSheet,
  };
};

module.exports = {
  measureTablePagination,
  getPrintablePageHeightPx,
};
