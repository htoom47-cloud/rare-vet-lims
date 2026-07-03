/**
 * Pure helpers — customer consolidated report notifications (testable without DB).
 */
const crypto = require('crypto');

const BATCH_TYPE = 'customer_report_batch';

const isReportReadyForCustomer = (report = {}) => {
  if (!report.pdf_url) return false;
  const approved = Boolean(report.lab_specialist_approved_by || report.vet_approved_by);
  const published = report.is_final !== false;
  return approved || published;
};

const buildConsolidatedReportMessage = ({ customerName, reports, portalUrl, labNameAr }) => {
  const name = (customerName || 'العميل').trim();
  const lab = labNameAr || 'مركز رعاية النوادر البيطري';
  const lines = [
    `مرحبًا ${name}`,
    `تم إصدار نتائج التحاليل التالية من ${lab}:`,
    '',
  ];

  reports.forEach((report, index) => {
    const animal = report.animal_name || report.animalName || '—';
    lines.push(`${index + 1}. تقرير رقم: ${report.report_number} — الحيوان: ${animal}`);
  });

  lines.push('');
  lines.push('للاطلاع على النتائج وتحميل التقارير:');
  if (portalUrl) lines.push(portalUrl);
  lines.push('');
  lines.push(`مع تحيات ${lab}`);
  return lines.join('\n');
};

const messageHash = (body) => crypto.createHash('sha256').update(String(body), 'utf8').digest('hex');

const parseMetadata = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const extractSentReportIds = (rows = []) => {
  const sent = new Set();
  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    if (meta.type !== BATCH_TYPE && meta.type !== 'customer_report_batch') {
      if (meta.report_ids?.length) {
        meta.report_ids.forEach((id) => sent.add(String(id)));
      }
      continue;
    }
    if (meta.type === BATCH_TYPE) {
      (meta.report_ids || []).forEach((id) => sent.add(String(id)));
    }
  }
  return sent;
};

const findDuplicateReportIds = (requestedIds, sentIds) => (
  requestedIds.filter((id) => sentIds.has(String(id)))
);

module.exports = {
  BATCH_TYPE,
  isReportReadyForCustomer,
  buildConsolidatedReportMessage,
  messageHash,
  parseMetadata,
  extractSentReportIds,
  findDuplicateReportIds,
};
