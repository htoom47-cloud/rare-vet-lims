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
  Mail,
  MessageCircle,
  Printer,
} from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { notificationsAPI, reportsAPI } from '../services/api';
import { DEMO_REPORT } from '../data/demoReport';

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

function CompactFlag({ flag, isCriticalFlag, isAr }) {
  if (!flag || flag === 'PENDING') return <span className="lab-flag lab-flag-pending">—</span>;
  if (flag === 'NORMAL' || flag === 'NEG') return <span className="lab-flag lab-flag-normal">{isAr ? 'ط' : 'N'}</span>;
  if (flag === 'POS') return <span className="lab-flag lab-flag-crit">+</span>;
  if (isCritical(flag, isCriticalFlag)) return <span className="lab-flag lab-flag-crit">!</span>;
  if (flag === 'HIGH' || flag === 'CRIT_HIGH') return <span className="lab-flag lab-flag-high">↑</span>;
  if (flag === 'LOW' || flag === 'CRIT_LOW') return <span className="lab-flag lab-flag-low">↓</span>;
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

export default function LaboratoryReport({ demoMode = false, initialReport = null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const reportRef = useRef(null);
  const [report, setReport] = useState(initialReport || (demoMode ? DEMO_REPORT : null));
  const [loading, setLoading] = useState(!demoMode && !initialReport);
  const [sending, setSending] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);

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

  const resultGroups = useMemo(() => groupResults(report?.results), [report]);

  const attachments = useMemo(() => report?.attachments || [], [report]);

  const speciesLabel = (type) => {
    const e = ANIMAL_TYPES[type];
    return e ? (isAr ? e.ar : e.en) : (type || '—');
  };

  const genderLabel = (g) => {
    const e = GENDERS[g];
    return e ? (isAr ? e.ar : e.en) : '—';
  };

  const setPrintMode = (on) => {
    document.documentElement.classList.toggle('printing-lab-report', on);
    document.body.classList.toggle('printing-lab-report', on);
  };

  const preparePdfExport = () => {
    const root = reportRef.current;
    if (!root) return () => {};
    const pageEl = root.closest('.lab-report-page');
    const prev = {
      pageDir: pageEl?.getAttribute('dir') ?? null,
      htmlDir: document.documentElement.getAttribute('dir'),
      bodyDir: document.body.getAttribute('dir'),
    };
    root.classList.add('lab-pdf-export');
    if (isAr) root.classList.add('lab-pdf-export-ar');
    if (pageEl) pageEl.setAttribute('dir', 'ltr');
    document.documentElement.setAttribute('dir', 'ltr');
    document.body.setAttribute('dir', 'ltr');
    return () => {
      root.classList.remove('lab-pdf-export', 'lab-pdf-export-ar');
      if (pageEl) {
        if (prev.pageDir) pageEl.setAttribute('dir', prev.pageDir);
        else pageEl.removeAttribute('dir');
      }
      if (prev.htmlDir) document.documentElement.setAttribute('dir', prev.htmlDir);
      else document.documentElement.removeAttribute('dir');
      if (prev.bodyDir) document.body.setAttribute('dir', prev.bodyDir);
      else document.body.removeAttribute('dir');
    };
  };

  const handlePrint = () => {
    setPrintMode(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        window.onafterprint = () => setPrintMode(false);
      });
    });
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    setPrintMode(true);
    const restorePdfLayout = preparePdfExport();
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const root = reportRef.current;
      const canvas = await html2canvas(root, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: root.scrollWidth,
        onclone: (clonedDoc, clonedElement) => {
          clonedDoc.documentElement.setAttribute('dir', 'ltr');
          clonedDoc.body.setAttribute('dir', 'ltr');
          clonedElement.setAttribute('dir', 'ltr');
          clonedElement.classList.add('lab-pdf-export');
          if (isAr) clonedElement.classList.add('lab-pdf-export-ar');
        },
      });

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const margin = 6;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;
      const imgH = (canvas.height * contentW) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      let position = margin;
      let heightLeft = imgH;
      pdf.addImage(imgData, 'JPEG', margin, position, contentW, imgH);
      heightLeft -= contentH;

      while (heightLeft > 0) {
        position = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, contentW, imgH);
        heightLeft -= contentH;
      }

      pdf.save(`${report.reportNumber}.pdf`);
      toast.success(t('labReport.downloadDone'));
    } catch {
      toast.error(t('labReport.downloadFailed'));
      handlePrint();
    } finally {
      restorePdfLayout();
      setPrintMode(false);
      setExportingPdf(false);
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
        <Button variant="ghost" size="sm" onClick={() => navigate(demoMode ? '/login' : '/reports')} className="gap-2 h-8">
          <ArrowLeft size={14} /> {t('labReport.back')}
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-1.5 h-8 text-xs"><Printer size={14} />{t('common.print')}</Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={exportingPdf} className="gap-1.5 h-8 text-xs"><Download size={14} />{exportingPdf ? t('common.loading') : t('labReport.downloadPdf')}</Button>
          <Button variant="secondary" size="sm" onClick={handleWhatsApp} className="gap-1.5 h-8 text-xs text-green-700"><MessageCircle size={14} />WhatsApp</Button>
          <Button variant="secondary" size="sm" onClick={handleEmail} disabled={sending === 'email'} className="gap-1.5 h-8 text-xs"><Mail size={14} />{t('labReport.email')}</Button>
        </div>
      </motion.div>

      <div
        ref={reportRef}
        className="lab-report-document lab-report-a4 mx-auto bg-white text-[#2d2118] shadow-lg print:shadow-none"
      >
        <header className="lab-rpt-header">
          <div className="lab-rpt-header-brand">
            <AppLogo size="sm" className="lab-rpt-logo shrink-0" />
            <div className="min-w-0">
              <h1 className="lab-rpt-lab-name">{labName}</h1>
              <p className="lab-rpt-lab-sub">{t('labReport.title')}</p>
            </div>
          </div>
          <div className="lab-rpt-header-meta">
            <div className="lab-rpt-meta-grid">
              <span><b>{t('labReport.reportNo')}</b> {report.reportNumber}</span>
              <span><b>{t('labReport.sampleId')}</b> {report.sampleCode || report.sample?.id}</span>
              <span><b>{t('labReport.issued')}</b> {fmtDate(report.issuedAt, locale, true)}</span>
              <span className={cn('lab-rpt-status', report.status === 'final' ? 'is-final' : 'is-prelim')}>{statusLabel}</span>
            </div>
            <div className="lab-rpt-header-codes">
              {report.barcode && (
                <Barcode value={report.barcode} width={0.95} height={24} fontSize={8} margin={0} displayValue />
              )}
              <div className="lab-rpt-qr-wrap">
                <QRCode value={report.verifyUrl} size={48} level="M" />
              </div>
            </div>
          </div>
        </header>

        <div className="lab-rpt-patient-bar">
          <PatientField label={t('customers.fullName')} value={report.customer.name} />
          <PatientField label={t('labReport.mobile')} value={report.customer.mobile} />
          <PatientField label={t('labReport.species')} value={speciesLabel(report.animal.type)} />
          <PatientField label={t('labReport.animalName')} value={report.animal.name} />
          <PatientField label={t('labReport.age')} value={report.animal.age} />
          <PatientField label={t('labReport.gender')} value={genderLabel(report.animal.gender)} />
          <PatientField label={t('labReport.chip')} value={report.animal.chip} />
          <PatientField label={t('labReport.sampleType')} value={report.sample.type} />
          <PatientField label={t('labReport.collectionDate')} value={fmtDate(report.sample.collectionDate, locale, true)} />
          <PatientField label={t('labReport.receivedDate')} value={fmtDate(report.sample.receivedDate, locale, true)} />
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
              {resultGroups.map((group) => (
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
                          <CompactFlag flag={row.flag} isCriticalFlag={row.isCritical} isAr={isAr} />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {attachments.length > 0 && (
          <section className="lab-rpt-images">
            <h3 className="lab-rpt-images-title">{t('labReport.microscopeImages')}</h3>
            <div className="lab-rpt-image-grid">
              {attachments.map((att, i) => (
                <figure key={i} className="lab-rpt-image-card">
                  <img
                    src={resolveImageUrl(att.fileUrl)}
                    alt={att.caption || (isAr ? att.testNameAr : att.testNameEn) || t('labReport.microscopeImages')}
                    className="lab-rpt-image"
                    crossOrigin="anonymous"
                  />
                  <figcaption className="lab-rpt-image-caption">
                    {att.caption || (isAr ? att.testNameAr : att.testNameEn) || '—'}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {(report.interpretation || report.recommendations) && (
          <div className="lab-rpt-notes">
            {report.interpretation && (
              <p dir={isAr ? 'rtl' : 'ltr'}><b>{t('labReport.interpretation')}:</b> {report.interpretation}</p>
            )}
            {report.recommendations && (
              <p dir={isAr ? 'rtl' : 'ltr'}><b>{t('labReport.recommendations')}:</b> {report.recommendations}</p>
            )}
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
