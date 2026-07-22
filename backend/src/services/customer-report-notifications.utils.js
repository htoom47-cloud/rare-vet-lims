/**
 * Pure helpers — customer consolidated report notifications (testable without DB).
 */
const crypto = require('crypto');

const BATCH_TYPE = 'customer_report_batch';

/** Queue statuses that clear a report from "ready to send" (no provider send for skipped). */
const HANDLED_BATCH_STATUSES = ['sent', 'dry_run', 'skipped'];
const HANDLED_BATCH_STATUS_SQL = `'sent', 'dry_run', 'skipped'`;

/** Msegat rejects SMS over ~700 chars (error 1140). Keep SMS compact. */
const MSEGAT_SMS_SAFE_CHARS = 650;

const isReportReadyForCustomer = (report = {}) => {
  if (!report.pdf_url) return false;
  const approved = Boolean(report.lab_specialist_approved_by || report.vet_approved_by);
  const published = report.is_final !== false;
  return approved || published;
};

const buildDetailedReportMessage = ({ name, lab, reports, portalUrl }) => {
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

/** Short body when text is large / SMS — ready notice + portal link only (no report numbers). */
const buildSmsReportMessage = ({ name, lab, portalUrl }) => {
  const lines = [
    `مرحبًا ${name}`,
    `تقاريرك جاهزة من ${lab}.`,
  ];
  if (portalUrl) {
    lines.push('للاطلاع وتحميل التقارير:');
    lines.push(portalUrl);
  }
  lines.push(`مع تحيات ${lab}`);
  return lines.join('\n');
};

/**
 * Consolidated customer notification body.
 * Long detailed lists are shortened to ready + portal link (no report numbers).
 * @param {{ customerName?: string, reports: object[], portalUrl?: string, labNameAr?: string, channel?: string }} opts
 */
const buildConsolidatedReportMessage = ({
  customerName, reports, portalUrl, labNameAr, channel,
} = {}) => {
  const name = (customerName || 'العميل').trim();
  const lab = labNameAr || 'مركز رعاية النوادر البيطري';
  const list = Array.isArray(reports) ? reports : [];
  const ch = String(channel || '').toLowerCase();
  const short = () => buildSmsReportMessage({ name, lab, portalUrl });

  if (ch === 'sms') return short();

  const detailed = buildDetailedReportMessage({ name, lab, reports: list, portalUrl });
  if (detailed.length > MSEGAT_SMS_SAFE_CHARS) return short();
  return detailed;
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
  HANDLED_BATCH_STATUSES,
  HANDLED_BATCH_STATUS_SQL,
  isReportReadyForCustomer,
  buildConsolidatedReportMessage,
  messageHash,
  parseMetadata,
  extractSentReportIds,
  findDuplicateReportIds,
};
