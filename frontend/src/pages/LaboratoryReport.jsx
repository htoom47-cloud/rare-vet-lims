import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Printer,
  RotateCcw,
} from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { notificationsAPI, reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DEMO_REPORT } from '../data/demoReport';
import { downloadLabReportPdf, printLabReport } from '../utils/labReportPrint';
import { isSinglePageLayout, isAbnormalFlag, flattenResults } from '../utils/reportLayout';

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' },
  horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' },
  cat: { en: 'Cat', ar: 'قط' },
  dog: { en: 'Dog', ar: 'كلب' },
};

const GENDERS = {
  male: { en: 'M', ar: 'ذ' },
  female: { en: 'F', ar: 'أ' },
  unknown: { en: '—', ar: '—' },
};

const PANEL_ORDER = { CBC: 0, CHEM: 1, HORM: 2, ELISA: 3, SERO: 4, PCR: 5, MICRO: 6, CULT: 7 };

const fmtDate = (value, locale, short = false) => {
  if (!value) return '—';
  const d = new Date(value);
  if (short) {
    return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  }
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const isAbnormal = (flag) => flag && !['NORMAL', 'NEG', 'PENDING'].includes(flag);
const isCritical = (flag, isCrit) => isCrit || flag === 'CRIT_HIGH' || flag === 'CRIT_LOW';

const formatUnit = (unit) => (!unit || unit === 'qual' ? '—' : unit);

const resolveImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

function groupResults(results) {
  const groups = [];
  const map = new Map();
  for (const row of results || []) {
    const key = row.testCode || row.testNameEn || 'OTHER';
    if (!map.has(key)) {
      map.set(key, {
        testCode: key,
        categoryCode: row.categoryCode,
        nameAr: row.testNameAr || row.nameAr,
        nameEn: row.testNameEn || row.nameEn,
        instrument: row.instrument,
        items: [],
      });
      groups.push(map.get(key));
    }
    map.get(key).items.push(row);
  }
  groups.sort((a, b) => {
    const catA = PANEL_ORDER[a.categoryCode] ?? 99;
    const catB = PANEL_ORDER[b.categoryCode] ?? 99;
    if (catA !== catB) return catA - catB;
    return String(a.testCode).localeCompare(String(b.testCode));
  });
  return groups;
}

function CompactFlag({ flag, isCriticalFlag }) {
  if (!flag || flag === 'PENDING') return <span className="lab-flag lab-flag-pending">—</span>;
  if (flag === 'NORMAL' || flag === 'NEG') return <span className="lab-flag lab-flag-empty" />;
  if (flag === 'POS') return <span className="lab-flag lab-flag-crit">+</span>;
  if (flag === 'HIGH' || flag === 'CRIT_HIGH') {
    const crit = flag === 'CRIT_HIGH' || (flag === 'HIGH' && isCriticalFlag);
    return <span className={cn('lab-flag lab-flag-high', crit && 'lab-flag-crit')}>↑</span>;
  }
  if (flag === 'LOW' || flag === 'CRIT_LOW') {
    const crit = flag === 'CRIT_LOW' || (flag === 'LOW' && isCriticalFlag);
    return <span className={cn('lab-flag lab-flag-low', crit && 'lab-flag-crit')}>↓</span>;
  }
  if (isCritical(flag, isCriticalFlag)) return <span className="lab-flag lab-flag-crit">!</span>;
  return <span className="lab-flag">{flag}</span>;
}

function PatientField({ label, value }) {
  return (
    <div className="lab-patient-field">
      <span className="lab-patient-label">{label}</span>
      <span className="lab-patient-value">{value || '—'}</span>
    </div>
  );
}

/** Active layout: report design #1 — see .cursor/rules/report-design-1.mdc */
export default function LaboratoryReport({ demoMode = false, initialReport = null, backPath = null, hideShareActions = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, hasPermission } = useAuth();
  const reportRef = useRef(null);
  const [report, setReport] = useState(initialReport || (demoMode ? DEMO_REPORT : null));
  const [loading, setLoading] = useState(!demoMode && !initialReport);
  const [sending, setSending] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);

  const canRegeneratePdf = !demoMode && hasPermission('reports.generate');

  const isAr = report?.language === 'ar' || i18n.language === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const locale = isAr ? 'ar' : 'en';

  const load = useCallback(async () => {
    if (initialReport) { setReport(initialReport); setLoading(false); return; }
    if (demoMode || id === 'demo') {
      setReport({ ...DEMO_REPORT, verifyUrl: `${window.location.origin}/verify/${DEMO_REPORT.verificationCode}` });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await reportsAPI.getPreview(id);
      setReport(data.data);
    } catch {
      toast.error(t('labReport.loadFailed'));
      navigate('/reports');
    } finally {
      setLoading(false);
    }
  }, [id, demoMode, initialReport, navigate, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onBeforePrint = () => {
      document.documentElement.classList.add('printing-lab-report');
      document.body.classList.add('printing-lab-report');
      toast.dismiss();
    };
    const onAfterPrint = () => {
      document.documentElement.classList.remove('printing-lab-report');
      document.body.classList.remove('printing-lab-report');
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      onAfterPrint();
    };
  }, []);

  const resultGroups = useMemo(() => groupResults(report?.results), [report]);
  const singlePage = useMemo(() => isSinglePageLayout(report), [report]);
  const flatResults = useMemo(() => flattenResults(resultGroups), [resultGroups]);
  const abnormalResults = useMemo(
    () => (report?.results || []).filter((r) => isAbnormalFlag(r.flag)),
    [report]
  );

  const attachments = useMemo(() => report?.attachments || [], [report]);

  const speciesLabel = (type) => {
    const e = ANIMAL_TYPES[type];
    return e ? (isAr ? e.ar : e.en) : (type || '—');
  };

  const genderLabel = (g) => {
    const e = GENDERS[g];
    return e ? (isAr ? e.ar : e.en) : '—';
  };

  const handlePrint = async () => {
    toast.dismiss();
    if (!reportRef.current) return;
    try {
      await printLabReport(reportRef.current, { isAr, dir });
    } catch {
      toast.error(t('labReport.downloadFailed'));
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    toast.dismiss();
    try {
      await downloadLabReportPdf(reportRef.current, {
        isAr,
        dir,
        filename: `${report.reportNumber}.pdf`,
      });
      setTimeout(() => toast.success(t('labReport.downloadDone')), 300);
    } catch {
      toast.error(t('labReport.downloadFailed'));
      await handlePrint();
    } finally {
      setExportingPdf(false);
    }
  };

  const handleOpenOfficialPdf = async () => {
    if (!report?.pdfUrl) return;
    try {
      await reportsAPI.openPdf(report.pdfUrl);
    } catch {
      toast.error(t('reports.openFailed'));
    }
  };

  const handleRegenerateOfficialPdf = async () => {
    if (!id || !report?.pdfUrl) return;
    setRegeneratingPdf(true);
    toast.dismiss();
    try {
      const updated = await reportsAPI.regenerateAndOpen(id, report.pdfUrl);
      setReport((prev) => (prev ? { ...prev, pdfUrl: updated.pdf_url } : prev));
      toast.success(t('reports.regenerateDone'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('reports.regenerateFailed'));
    } finally {
      setRegeneratingPdf(false);
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`${isAr ? 'تقرير' : 'Report'}: ${report.reportNumber}\n${report.verifyUrl}`);
    window.open(`https://wa.me/${(report.customer.mobile || '').replace(/\D/g, '')}?text=${text}`, '_blank');
  };

  const handleEmail = async () => {
    if (!report?.sampleId) return;
    const recipient = report.customer.mobile || report.lab?.email;
    if (!recipient) { toast.error(t('labReport.noRecipient')); return; }
    setSending('email');
    try {
      await notificationsAPI.sendReport(report.sampleId, 'email', recipient);
      toast.success(t('labReport.sent'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('labReport.sendFailed'));
    } finally {
      setSending(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-[210mm] mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[700px] w-full" />
      </div>
    );
  }

  if (!report) return null;

  const labName = isAr ? report.lab.nameAr : report.lab.name;
  const statusLabel = report.status === 'final' ? t('labReport.final') : t('labReport.preliminary');

  return (
    <div className="lab-report-page" dir={dir}>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="no-print flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between mb-4"
      >
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath || (demoMode ? '/login' : '/reports'))} className="gap-2 h-8">
          <ArrowLeft size={14} /> {t('labReport.back')}
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-1.5 h-8 text-xs"><Printer size={14} />{t('common.print')}</Button>
          {report.pdfUrl && (
            <Button variant="secondary" size="sm" onClick={handleOpenOfficialPdf} className="gap-1.5 h-8 text-xs">
              <FileText size={14} />{t('labReport.openOfficialPdf')}
            </Button>
          )}
          {canRegeneratePdf && report.pdfUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRegenerateOfficialPdf}
              disabled={regeneratingPdf}
              className="gap-1.5 h-8 text-xs text-amber-800"
            >
              <RotateCcw size={14} />{regeneratingPdf ? t('common.loading') : t('labReport.regeneratePdf')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={exportingPdf} className="gap-1.5 h-8 text-xs"><Download size={14} />{exportingPdf ? t('common.loading') : t('labReport.downloadPdf')}</Button>
          {!hideShareActions && (
            <>
              <Button variant="secondary" size="sm" onClick={handleWhatsApp} className="gap-1.5 h-8 text-xs text-green-700"><MessageCircle size={14} />WhatsApp</Button>
              <Button variant="secondary" size="sm" onClick={handleEmail} disabled={sending === 'email'} className="gap-1.5 h-8 text-xs"><Mail size={14} />{t('labReport.email')}</Button>
            </>
          )}
        </div>
      </motion.div>

      <div
        ref={reportRef}
        className={cn(
          'lab-report-document lab-report-a4 mx-auto bg-white text-[#2d2118] shadow-lg print:shadow-none',
          singlePage && 'lab-report-single-page'
        )}
      >
        <header className="lab-rpt-header">
          <div className="lab-rpt-header-brand">
            <AppLogo size="sm" className="lab-rpt-logo shrink-0" />
            <div className="min-w-0">
              <h1 className="lab-rpt-lab-name">{labName}</h1>
              <p className="lab-rpt-lab-sub">
                {singlePage ? (
                  <>Laboratory Results Report · تقرير نتائج المختبر</>
                ) : (
                  t('labReport.title')
                )}
              </p>
            </div>
          </div>
          <div className="lab-rpt-header-meta">
            <div className="lab-rpt-meta-grid">
              <span><b>{t('labReport.reportNo')}</b> {report.reportNumber}</span>
              <span><b>{t('labReport.sampleId')}</b> {report.sampleCode || report.sample?.id}</span>
              <span><b>{t('labReport.issued')}</b> {fmtDate(report.issuedAt, locale, true)}</span>
              {singlePage && (
                <span className={cn('lab-rpt-status', report.status === 'final' ? 'is-final' : 'is-prelim')}>{statusLabel}</span>
              )}
            </div>
            <div className="lab-rpt-header-codes">
              {report.barcode && (
                <Barcode
                  value={report.barcode}
                  width={singlePage ? 0.75 : 0.95}
                  height={singlePage ? 18 : 24}
                  fontSize={singlePage ? 7 : 8}
                  margin={0}
                  displayValue
                />
              )}
              <div className="lab-rpt-qr-wrap">
                <QRCode value={report.verifyUrl} size={singlePage ? 36 : 48} level="M" />
              </div>
            </div>
          </div>
        </header>

        {!singlePage && (
        <div className="lab-rpt-title-banner">
          <span className="lab-rpt-title-en">Laboratory Results Report</span>
          <span className="lab-rpt-title-ar">تقرير نتائج المختبر</span>
          <span className={cn('lab-rpt-title-badge', report.status === 'final' ? 'is-final' : 'is-prelim')}>
            {statusLabel}
          </span>
        </div>
        )}

        <div className={cn('lab-rpt-patient-bar', singlePage && 'lab-rpt-patient-bar-compact')}>
          <PatientField label={t('customers.fullName')} value={report.customer.name} />
          <PatientField label={t('labReport.mobile')} value={report.customer.mobile} />
          <PatientField label={t('labReport.species')} value={speciesLabel(report.animal.type)} />
          <PatientField label={t('labReport.animalName')} value={report.animal.name} />
          {!singlePage && (
            <>
              <PatientField label={t('labReport.age')} value={report.animal.age} />
              <PatientField label={t('labReport.gender')} value={genderLabel(report.animal.gender)} />
              <PatientField label={t('labReport.chip')} value={report.animal.chip} />
              <PatientField label={t('labReport.sampleType')} value={report.sample.type} />
              <PatientField label={t('labReport.collectionDate')} value={fmtDate(report.sample.collectionDate, locale, true)} />
              <PatientField label={t('labReport.receivedDate')} value={fmtDate(report.sample.receivedDate, locale, true)} />
            </>
          )}
          {singlePage && (
            <>
              <PatientField label={t('labReport.gender')} value={genderLabel(report.animal.gender)} />
              <PatientField label={t('labReport.sampleType')} value={report.sample.type} />
            </>
          )}
        </div>

        <div className="lab-rpt-table-wrap">
          <table className="lab-rpt-table lab-results-table">
            <thead>
              <tr>
                <th className="col-test">{t('labReport.testNameAr')}</th>
                <th className="col-result">{t('labReport.result')}</th>
                <th className="col-unit">{t('labReport.unit')}</th>
                <th className="col-ref">{t('labReport.reference')}</th>
                <th className="col-flag">{t('labReport.flag')}</th>
              </tr>
            </thead>
            <tbody>
              {singlePage ? (
                flatResults.map((row, idx) => {
                  const abnormal = isAbnormal(row.flag);
                  return (
                    <tr key={`${row.code}-${idx}`} className={cn(abnormal && 'row-abnormal')}>
                      <td className="col-test">
                        <span className="test-name-ar">{row.nameAr}</span>
                        <span className="test-name-en">{row.nameEn}</span>
                      </td>
                      <td className={cn('col-result', abnormal && 'val-abnormal')}>{row.value}</td>
                      <td className="col-unit">{formatUnit(row.unit)}</td>
                      <td className="col-ref">{row.reference}</td>
                      <td className="col-flag">
                        <CompactFlag flag={row.flag} isCriticalFlag={row.isCritical} />
                      </td>
                    </tr>
                  );
                })
              ) : (
              resultGroups.map((group) => (
                <Fragment key={group.testCode}>
                  <tr className="lab-rpt-panel-row">
                    <td colSpan={5}>
                      <span className="lab-rpt-panel-name">
                        {isAr ? group.nameAr : group.nameEn}
                      </span>
                      {group.instrument && (
                        <span className="lab-rpt-panel-device">{group.instrument}</span>
                      )}
                    </td>
                  </tr>
                  {group.items.map((row, idx) => {
                    const abnormal = isAbnormal(row.flag);
                    return (
                      <tr key={`${group.testCode}-${row.code}-${idx}`} className={cn(abnormal && 'row-abnormal')}>
                        <td className="col-test">
                          <span className="test-name-ar">{row.nameAr}</span>
                          <span className="test-name-en">{row.nameEn}</span>
                        </td>
                        <td className={cn('col-result', abnormal && 'val-abnormal')}>{row.value}</td>
                        <td className="col-unit">{formatUnit(row.unit)}</td>
                        <td className="col-ref">{row.reference}</td>
                        <td className="col-flag">
                          <CompactFlag flag={row.flag} isCriticalFlag={row.isCritical} />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))
              )}
            </tbody>
          </table>

          {abnormalResults.length > 0 && (
            <div className="lab-rpt-abnormal-box">
              <span className="lab-rpt-abnormal-title">{t('labReport.abnormalSummary')}:</span>
              {' '}
              {abnormalResults.map((r, i) => (
                <span key={r.code || i} className="lab-rpt-abnormal-item">
                  {i > 0 && ' · '}
                  <b>{isAr ? r.nameAr : r.nameEn}</b>: {r.value}
                </span>
              ))}
            </div>
          )}
        </div>

        {attachments.length > 0 && (
          <section className="lab-rpt-images">
            <h3 className="lab-rpt-images-title">{t('labReport.microscopeImages')}</h3>
            <div className="lab-rpt-image-grid">
              {attachments.map((att, i) => (
                <figure key={i} className="lab-rpt-image-card">
                  {att.missing ? (
                    <div className="lab-rpt-image lab-rpt-image-missing">{t('labReport.imageUnavailable')}</div>
                  ) : (
                    <img
                      src={resolveImageUrl(att.fileUrl)}
                      alt={att.caption || (isAr ? att.testNameAr : att.testNameEn) || t('labReport.microscopeImages')}
                      className="lab-rpt-image"
                      crossOrigin="anonymous"
                    />
                  )}
                  <figcaption className="lab-rpt-image-caption">
                    {att.caption || (isAr ? att.testNameAr : att.testNameEn) || '—'}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {(report.recommendations) && (
          <div className="lab-rpt-notes">
            {report.recommendations && (
              <p dir={isAr ? 'rtl' : 'ltr'}><b>{t('labReport.recommendations')}:</b> {report.recommendations}</p>
            )}
          </div>
        )}

        {!singlePage && (
        <div className="lab-rpt-flag-legend">
          <span><span className="lab-flag lab-flag-high">↑</span> {t('labReport.high')}</span>
          <span><span className="lab-flag lab-flag-low">↓</span> {t('labReport.low')}</span>
          <span><span className="lab-flag lab-flag-crit">+</span> {t('labReport.positive')}</span>
        </div>
        )}

        <footer className="lab-rpt-footer">
          <div className="lab-rpt-signatures">
            <div className="lab-rpt-sig">
              <span className="lab-rpt-sig-label">{t('reports.labApproval')}</span>
              <span className="lab-rpt-sig-name">
                {report.approvals.lab?.approved ? report.approvals.lab.name : t('reports.pendingApproval')}
              </span>
              {report.approvals.lab?.approvedAt && (
                <span className="lab-rpt-sig-date">{fmtDate(report.approvals.lab.approvedAt, locale, true)}</span>
              )}
            </div>
            <div className="lab-rpt-sig">
              <span className="lab-rpt-sig-label">{t('reports.vetApproval')}</span>
              <span className="lab-rpt-sig-name">
                {report.approvals.vet?.approved ? report.approvals.vet.name : t('reports.pendingApproval')}
              </span>
              {report.approvals.vet?.approvedAt && (
                <span className="lab-rpt-sig-date">{fmtDate(report.approvals.vet.approvedAt, locale, true)}</span>
              )}
            </div>
          </div>
          <div className="lab-rpt-footer-info">
            <p className="lab-rpt-contact">{labName} · {report.lab.phone} · {report.lab.email}</p>
            <p className="lab-rpt-legal">{t('labReport.legal')}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
