/** Report design #1 — iframe/print CSS snapshot (Jun 2026). Do not edit unless restoring design 1. */
export const DESIGN_ID = 1;

export const LAB_REPORT_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 6mm 8mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #fff; color: #2d2118;
    font-family: Arial, Helvetica, 'Segoe UI', Tahoma, sans-serif;
    font-size: 8.5pt; line-height: 1.25;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .lab-report-document {
    width: 100%; max-width: 210mm; margin: 0 auto; background: #fff;
  }
  .lab-rpt-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 8px; padding: 6px 8px 5px; border-bottom: 2px solid #C9A86A;
  }
  .lab-rpt-header-brand { display: flex; align-items: center; gap: 8px; order: 2; text-align: right; }
  .lab-rpt-header-meta { display: flex; align-items: flex-start; gap: 8px; order: 1; }
  .lab-rpt-logo { width: 34px !important; height: 34px !important; object-fit: contain; }
  .lab-rpt-lab-name { font-size: 11pt; font-weight: 700; color: #5B3A29; margin: 0; line-height: 1.15; }
  .lab-rpt-lab-sub { font-size: 7.5pt; color: #6b5344; margin: 2px 0 0; }
  .lab-rpt-meta-grid { display: flex; flex-direction: column; gap: 2px; font-size: 7.5pt; text-align: left; }
  .lab-rpt-meta-grid b { font-weight: 600; color: #5B3A29; }
  .lab-rpt-status { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; }
  .lab-rpt-status.is-final { background: #16a34a; color: #fff; }
  .lab-rpt-status.is-prelim { background: #d97706; color: #fff; }
  .lab-rpt-header-codes { display: flex; align-items: center; gap: 4px; }
  .lab-rpt-qr-wrap { background: #fff; padding: 2px; border: 1px solid #C9A86A40; border-radius: 3px; }
  .lab-rpt-title-banner {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 4px 8px; background: #5B3A29; color: #F7F5F2; position: relative;
  }
  .lab-rpt-title-en { font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .lab-rpt-title-ar { font-size: 8pt; font-weight: 700; }
  .lab-rpt-title-badge {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    padding: 1px 8px; border-radius: 3px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase;
  }
  .lab-rpt-title-badge.is-final { background: #16a34a; color: #fff; }
  .lab-rpt-title-badge.is-prelim { background: #d97706; color: #fff; }
  .lab-rpt-flag-legend {
    display: flex; flex-wrap: wrap; gap: 10px; margin: 2px 8px 4px; font-size: 6.5pt; color: #8b7355;
  }
  .lab-rpt-patient-bar {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 4px 8px; padding: 5px 8px; background: #F7F5F2; border-bottom: 1px solid #C9A86A30;
  }
  .lab-patient-label { display: block; font-size: 6pt; text-transform: uppercase; color: #8b7355; line-height: 1.2; }
  .lab-patient-value { display: block; font-size: 8pt; font-weight: 600; color: #2d2118; line-height: 1.25; word-break: break-word; }
  .lab-report-ar .lab-patient-label, .lab-report-ar .lab-patient-value { text-align: right; }
  .lab-rpt-table { width: 100%; border-collapse: collapse; font-size: 7pt; }
  .lab-rpt-table thead tr { background: #5B3A29; color: #fff; }
  .lab-rpt-table th { padding: 2px 3px; font-size: 6.5pt; font-weight: 600; text-transform: uppercase; }
  .lab-rpt-table td { padding: 1px 3px; vertical-align: middle; border-bottom: 1px solid #e8e0d8; line-height: 1.15; }
  .lab-rpt-table tbody tr:nth-child(even):not(.row-abnormal) { background: #faf8f5; }
  .lab-rpt-table tbody tr.row-abnormal { background: #fef2f2; }
  .lab-rpt-table .col-test { width: 40%; }
  .lab-rpt-table .col-result { width: 12%; text-align: center; font-weight: 700; }
  .lab-rpt-table .col-unit { width: 10%; text-align: center; color: #6b5344; font-size: 7.5pt; }
  .lab-rpt-table .col-ref { width: 18%; text-align: center; color: #6b5344; font-size: 7.5pt; }
  .lab-rpt-table .col-flag { width: 6%; text-align: center; }
  .lab-report-ar .lab-rpt-table .col-test, .lab-report-ar .lab-rpt-panel-row td { text-align: right; }
  .test-name-ar { display: block; font-weight: 600; font-size: 8pt; line-height: 1.15; }
  .test-name-en { display: block; font-size: 6.5pt; color: #8b7355; line-height: 1.1; }
  .val-abnormal { color: #b91c1c; }
  .lab-rpt-panel-row td { padding: 2px 4px !important; background: #5B3A29; color: #F7F5F2; border-bottom: none; border-left: 3px solid #C9A86A; }
  .lab-rpt-panel-name { font-size: 7pt; font-weight: 700; }
  .lab-rpt-panel-device { font-size: 6.5pt; opacity: 0.85; margin-left: 8px; }
  .lab-flag {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px; border-radius: 50%; font-size: 7pt; font-weight: 700;
  }
  .lab-flag-normal { background: #dcfce7; color: #15803d; }
  .lab-flag-empty { background: transparent; color: transparent; }
  .lab-flag-high { background: #fee2e2; color: #b91c1c; }
  .lab-flag-low { background: #ffedd5; color: #c2410c; }
  .lab-flag-crit { background: #7f1d1d; color: #fff; }
  .lab-flag-pending { background: #f3f4f6; color: #9ca3af; }
  .lab-rpt-images { margin: 4px 8px; }
  .lab-rpt-images-title { font-size: 7.5pt; font-weight: 700; color: #5B3A29; margin: 0 0 4px; border-bottom: 1px solid #C9A86A50; padding-bottom: 2px; }
  .lab-report-ar .lab-rpt-images-title { text-align: right; }
  .lab-rpt-image-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
  .lab-rpt-image-card { margin: 0; border: 1px solid #e8e0d8; border-radius: 3px; overflow: hidden; background: #faf8f5; }
  .lab-rpt-image { display: block; width: 100%; height: auto; max-height: 120px; object-fit: contain; background: #f3f0eb; }
  .lab-rpt-image-caption { padding: 2px 4px; font-size: 6.5pt; text-align: center; color: #5B3A29; }
  .lab-rpt-image-missing, .lab-rpt-image-fallback {
    display: flex; align-items: center; justify-content: center; min-height: 80px;
    padding: 6px; font-size: 7pt; color: #5B3A29; text-align: center; background: #f3f0eb;
  }
  .lab-rpt-notes {
    margin: 4px 8px; padding: 4px 6px; background: #faf8f5;
    border-left: 2px solid #C9A86A; font-size: 7.5pt; line-height: 1.35;
  }
  .lab-report-ar .lab-rpt-notes { text-align: right; border-left: none; border-right: 2px solid #C9A86A; }
  .lab-rpt-notes p { margin: 0 0 2px; }
  .lab-rpt-footer {
    display: grid; grid-template-columns: 1fr 1.4fr; gap: 6px;
    padding: 3px 6px 4px; margin-top: 2px; border-top: 2px solid #C9A86A; font-size: 6.5pt;
  }
  .lab-report-ar .lab-rpt-footer-info, .lab-report-ar .lab-rpt-sig-name { text-align: right; }
  .lab-rpt-signatures { display: flex; gap: 12px; }
  .lab-rpt-sig-label { display: block; font-size: 6pt; text-transform: uppercase; color: #8b7355; }
  .lab-rpt-sig-name { display: block; font-size: 8pt; font-weight: 600; border-bottom: 1px dashed #C9A86A80; padding-bottom: 2px; margin-top: 1px; }
  .lab-rpt-sig-date { font-size: 6pt; color: #8b7355; }
  .lab-rpt-contact { margin: 0 0 2px; color: #5B3A29; font-weight: 500; }
  .lab-rpt-legal { margin: 0; font-size: 6pt; color: #8b7355; }
`;
