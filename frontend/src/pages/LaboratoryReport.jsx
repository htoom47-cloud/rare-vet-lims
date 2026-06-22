import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Download,
  Mail,
  MessageCircle,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { notificationsAPI, reportsAPI } from '../services/api';
import { DEMO_REPORT } from '../data/demoReport';

const BRAND = {
  primary: '#5B3A29',
  secondary: '#C9A86A',
  accent: '#F7F5F2',
};

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
  male: { en: 'Male', ar: 'ذكر' },
  female: { en: 'Female', ar: 'أنثى' },
  unknown: { en: 'Unknown', ar: 'غير محدد' },
};

const fmtDate = (value, locale) => {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isAbnormal = (flag) => flag && flag !== 'NORMAL';

const isCritical = (flag, isCrit) =>
  isCrit || flag === 'CRIT_HIGH' || flag === 'CRIT_LOW';

function ResultFlagBadge({ flag, isCriticalFlag, isAr }) {
  if (!flag || flag === 'PENDING') {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300">
        {isAr ? 'معلق' : 'Pending'}
      </Badge>
    );
  }
  if (flag === 'NORMAL') {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
        {isAr ? 'طبيعي' : 'Normal'}
      </Badge>
    );
  }
  if (isCritical(flag, isCriticalFlag)) {
    return (
      <Badge className="bg-red-900 text-white border-red-950 gap-1">
        <AlertTriangle size={12} />
        {isAr ? 'حرج' : 'Critical'}
      </Badge>
    );
  }
  if (flag === 'HIGH' || flag === 'CRIT_HIGH') {
    return (
      <Badge className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 gap-0.5">
        {isAr ? 'مرتفع' : 'High'}
        <ArrowUp size={12} />
      </Badge>
    );
  }
  if (flag === 'LOW' || flag === 'CRIT_LOW') {
    return (
      <Badge className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 gap-0.5">
        {isAr ? 'منخفض' : 'Low'}
        <ArrowDown size={12} />
      </Badge>
    );
  }
  return <Badge variant="outline">{flag}</Badge>;
}

function InfoGrid({ items, isAr }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">{label}</dt>
          <dd className="font-medium text-foreground break-words">{value || '—'}</dd>
        </div>
      ))}
    </dl>
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
    if (initialReport) {
      setReport(initialReport);
      setLoading(false);
      return;
    }
    if (demoMode || id === 'demo') {
      setReport({
        ...DEMO_REPORT,
        verifyUrl: `${window.location.origin}/verify/${DEMO_REPORT.verificationCode}`,
      });
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

  useEffect(() => {
    load();
  }, [load]);

  const abnormalResults = useMemo(
    () => (report?.results || []).filter((r) => isAbnormal(r.flag)),
    [report]
  );

  const uniqueInstruments = useMemo(() => {
    const set = new Set((report?.results || []).map((r) => r.instrument).filter(Boolean));
    return [...set];
  }, [report]);

  const speciesLabel = (type) => {
    const entry = ANIMAL_TYPES[type];
    if (!entry) return type || '—';
    return isAr ? entry.ar : entry.en;
  };

  const genderLabel = (gender) => {
    const entry = GENDERS[gender];
    if (!entry) return gender || '—';
    return isAr ? entry.ar : entry.en;
  };

  const setPrintMode = (on) => {
    document.documentElement.classList.toggle('printing-lab-report', on);
    document.body.classList.toggle('printing-lab-report', on);
  };

  const handlePrint = () => {
    setPrintMode(true);
    window.print();
    window.onafterprint = () => setPrintMode(false);
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    setPrintMode(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `${report.reportNumber}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: '.avoid-break' },
        })
        .from(reportRef.current)
        .save();
      toast.success(t('labReport.downloadDone'));
    } catch {
      toast.error(t('labReport.downloadFailed'));
      handlePrint();
    } finally {
      setPrintMode(false);
      setExportingPdf(false);
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `${isAr ? 'تقرير مختبر' : 'Lab Report'}: ${report.reportNumber}\n${report.verifyUrl}`
    );
    const phone = (report.customer.mobile || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const handleEmail = async () => {
    if (!report?.sampleId) return;
    const recipient = report.customer.mobile || report.lab?.email;
    if (!recipient) {
      toast.error(t('labReport.noRecipient'));
      return;
    }
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
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!report) return null;

  const labName = isAr ? report.lab.nameAr : report.lab.name;
  const labSubtitle = isAr ? report.lab.subtitleAr : report.lab.subtitle;

  return (
    <div className="lab-report-page" dir={dir}>
      {/* Action bar — hidden when printing */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="no-print flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6"
      >
        <Button variant="ghost" size="sm" onClick={() => navigate(demoMode ? '/login' : '/reports')} className="gap-2">
          <ArrowLeft size={16} />
          {t('labReport.back')}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-2">
            <Printer size={16} />
            {t('common.print')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={exportingPdf} className="gap-2">
            <Download size={16} />
            {exportingPdf ? t('common.loading') : t('labReport.downloadPdf')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleWhatsApp} className="gap-2 text-green-700">
            <MessageCircle size={16} />
            WhatsApp
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEmail}
            disabled={sending === 'email'}
            className="gap-2"
          >
            <Mail size={16} />
            {t('labReport.email')}
          </Button>
        </div>
      </motion.div>

      {/* Report document */}
      <motion.div
        ref={reportRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="lab-report-document relative mx-auto bg-white dark:bg-[#1a1512] text-[#2d2118] dark:text-[#F7F5F2] shadow-xl print:shadow-none rounded-none sm:rounded-lg overflow-hidden"
        style={{ maxWidth: '210mm' }}
      >
        {/* Watermark */}
        <div className="lab-report-watermark pointer-events-none select-none" aria-hidden>
          <AppLogo size="lg" className="opacity-[0.04] w-48 h-48" />
        </div>

        <div className="relative z-10 p-6 sm:p-8 print:p-6">
          {/* Header */}
          <header className="border-b-2 pb-5 mb-6" style={{ borderColor: BRAND.secondary }}>
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start">
              <div className="flex gap-4 items-start">
                <AppLogo size="lg" className="shrink-0" />
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: BRAND.primary }}>
                    {labName}
                  </h1>
                  <p className="text-sm mt-0.5 opacity-80">{labSubtitle}</p>
                  <p className="text-xs mt-2 uppercase tracking-widest font-semibold" style={{ color: BRAND.secondary }}>
                    {t('labReport.title')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 items-start">
                <div className="text-xs space-y-1 min-w-[140px]">
                  <p><span className="text-muted-foreground">{t('labReport.reportNo')}:</span> <strong className="font-mono">{report.reportNumber}</strong></p>
                  <p><span className="text-muted-foreground">{t('labReport.orderNo')}:</span> <strong className="font-mono">{report.orderNumber}</strong></p>
                  <p><span className="text-muted-foreground">{t('labReport.requested')}:</span> {fmtDate(report.requestedAt, locale)}</p>
                  <p><span className="text-muted-foreground">{t('labReport.issued')}:</span> {fmtDate(report.issuedAt, locale)}</p>
                  <Badge
                    className={cn(
                      'mt-1',
                      report.status === 'final'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    )}
                  >
                    {report.status === 'final' ? t('labReport.final') : t('labReport.preliminary')}
                  </Badge>
                </div>
                {report.barcode && (
                  <div className="bg-white p-1 rounded">
                    <Barcode value={report.barcode} width={1.2} height={36} fontSize={10} margin={0} displayValue />
                  </div>
                )}
                <div className="bg-white p-2 rounded border border-[#C9A86A]/30">
                  <QRCode value={report.verifyUrl} size={72} level="M" />
                  <p className="text-[9px] text-center mt-1 text-muted-foreground">{t('labReport.verify')}</p>
                </div>
              </div>
            </div>
          </header>

          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 avoid-break">
            <Card className="border-[#C9A86A]/25 bg-[#F7F5F2]/50 dark:bg-[#251e1a] shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold" style={{ color: BRAND.primary }}>
                  {t('labReport.clientInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <InfoGrid
                  isAr={isAr}
                  items={[
                    { label: t('customers.fullName'), value: report.customer.name },
                    { label: t('labReport.mobile'), value: report.customer.mobile },
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="border-[#C9A86A]/25 bg-[#F7F5F2]/50 dark:bg-[#251e1a] shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold" style={{ color: BRAND.primary }}>
                  {t('labReport.animalInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <InfoGrid
                  isAr={isAr}
                  items={[
                    { label: t('labReport.species'), value: speciesLabel(report.animal.type) },
                    { label: t('labReport.animalName'), value: report.animal.name },
                    { label: t('labReport.chip'), value: report.animal.chip },
                    { label: t('labReport.age'), value: report.animal.age },
                    { label: t('labReport.gender'), value: genderLabel(report.animal.gender) },
                    { label: t('labReport.color'), value: report.animal.color },
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="border-[#C9A86A]/25 bg-[#F7F5F2]/50 dark:bg-[#251e1a] shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold" style={{ color: BRAND.primary }}>
                  {t('labReport.sampleInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <InfoGrid
                  isAr={isAr}
                  items={[
                    { label: t('labReport.sampleId'), value: report.sample.id },
                    { label: t('labReport.sampleType'), value: report.sample.type },
                    { label: t('labReport.collectionDate'), value: fmtDate(report.sample.collectionDate, locale) },
                    { label: t('labReport.receivedDate'), value: fmtDate(report.sample.receivedDate, locale) },
                    { label: t('labReport.sampleCondition'), value: report.sample.condition },
                    { label: t('labReport.collectedBy'), value: report.sample.collectedBy },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          {/* Results table */}
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 pb-2 border-b" style={{ color: BRAND.primary, borderColor: BRAND.secondary }}>
              {t('labReport.results')}
            </h2>
            <div className="overflow-x-auto rounded-lg border border-[#C9A86A]/20">
              <table className="lab-results-table w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#5B3A29] text-white">
                    <th className="px-2 py-2.5 text-start font-medium">{t('labReport.testCode')}</th>
                    <th className="px-2 py-2.5 text-start font-medium">{t('labReport.testNameAr')}</th>
                    <th className="px-2 py-2.5 text-start font-medium hidden md:table-cell">{t('labReport.testNameEn')}</th>
                    <th className="px-2 py-2.5 text-center font-medium">{t('labReport.result')}</th>
                    <th className="px-2 py-2.5 text-center font-medium">{t('labReport.unit')}</th>
                    <th className="px-2 py-2.5 text-center font-medium hidden sm:table-cell">{t('labReport.reference')}</th>
                    <th className="px-2 py-2.5 text-center font-medium">{t('labReport.flag')}</th>
                    <th className="px-2 py-2.5 text-start font-medium hidden lg:table-cell">{t('labReport.method')}</th>
                    <th className="px-2 py-2.5 text-start font-medium hidden lg:table-cell">{t('labReport.instrument')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((row, idx) => {
                    const abnormal = isAbnormal(row.flag);
                    return (
                      <tr
                        key={`${row.code}-${idx}`}
                        className={cn(
                          'border-b border-[#C9A86A]/10 avoid-break',
                          abnormal && 'bg-red-50/80 dark:bg-red-950/20',
                          idx % 2 === 0 && !abnormal && 'bg-[#F7F5F2]/30 dark:bg-white/[0.02]'
                        )}
                      >
                        <td className="px-2 py-2 font-mono text-[11px]">{row.testCode || row.code}</td>
                        <td className="px-2 py-2">{row.nameAr}</td>
                        <td className="px-2 py-2 hidden md:table-cell text-muted-foreground">{row.nameEn}</td>
                        <td className={cn('px-2 py-2 text-center font-bold tabular-nums', abnormal && 'text-red-700 dark:text-red-400')}>
                          {row.value}
                        </td>
                        <td className="px-2 py-2 text-center text-muted-foreground">{row.unit || '—'}</td>
                        <td className="px-2 py-2 text-center hidden sm:table-cell text-muted-foreground tabular-nums">{row.reference}</td>
                        <td className="px-2 py-2 text-center">
                          <ResultFlagBadge flag={row.flag} isCriticalFlag={row.isCritical} isAr={isAr} />
                        </td>
                        <td className="px-2 py-2 hidden lg:table-cell text-muted-foreground text-[11px]">{row.method}</td>
                        <td className="px-2 py-2 hidden lg:table-cell text-[11px]">{row.instrument}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Abnormal summary */}
          {abnormalResults.length > 0 && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 avoid-break"
            >
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>
                {t('labReport.abnormalSummary')}
              </h2>
              <Card className="border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900">
                <CardContent className="pt-4 space-y-2">
                  {abnormalResults.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <ResultFlagBadge flag={r.flag} isCriticalFlag={r.isCritical} isAr={isAr} />
                      <span className="font-medium">{isAr ? r.nameAr : r.nameEn}</span>
                      <span className="font-bold text-red-700 dark:text-red-400">{r.value}</span>
                      <span className="text-muted-foreground">{r.unit}</span>
                      <span className="text-xs text-muted-foreground">
                        ({t('labReport.ref')}: {r.reference})
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.section>
          )}

          {/* Interpretation */}
          {report.interpretation && (
            <section className="mb-6 avoid-break">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 pb-2 border-b" style={{ color: BRAND.primary, borderColor: BRAND.secondary }}>
                {t('labReport.interpretation')}
              </h2>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg p-4 bg-[#F7F5F2]/60 dark:bg-white/5 border border-[#C9A86A]/20"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                {report.interpretation}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {report.recommendations && (
            <section className="mb-6 avoid-break">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 pb-2 border-b" style={{ color: BRAND.primary, borderColor: BRAND.secondary }}>
                {t('labReport.recommendations')}
              </h2>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg p-4 border-l-4"
                style={{ borderColor: BRAND.secondary, backgroundColor: `${BRAND.accent}99` }}
                dir={isAr ? 'rtl' : 'ltr'}
              >
                {report.recommendations}
              </div>
            </section>
          )}

          {/* Instruments used */}
          {uniqueInstruments.length > 0 && (
            <section className="mb-6 avoid-break">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: BRAND.primary }}>
                {t('labReport.instrumentsUsed')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {uniqueInstruments.map((device) => (
                  <Badge key={device} variant="gold" className="px-3 py-1">
                    {device}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Approvals */}
          <section className="mb-6 avoid-break">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 pb-2 border-b" style={{ color: BRAND.primary, borderColor: BRAND.secondary }}>
              {t('labReport.approval')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { key: 'lab', data: report.approvals.lab, label: t('reports.labApproval') },
                { key: 'vet', data: report.approvals.vet, label: t('reports.vetApproval') },
              ].map(({ key, data, label }) => (
                <div key={key} className="border border-[#C9A86A]/25 rounded-xl p-4 bg-[#F7F5F2]/30 dark:bg-white/5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
                  {data?.approved ? (
                    <>
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
                        <CheckCircle2 size={18} />
                        <span className="font-semibold">{data.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground italic border-t border-dashed pt-3 mt-2">
                        {t('labReport.eSignature')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmtDate(data.approvedAt, locale)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-amber-700 dark:text-amber-400">{t('reports.pendingApproval')}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} style={{ color: BRAND.secondary }} />
              <span>{t('labReport.stampNote')}</span>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t-2 pt-5 mt-8 avoid-break" style={{ borderColor: BRAND.secondary }}>
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-end">
              <div className="text-xs space-y-1 text-muted-foreground">
                <p className="font-semibold text-foreground">{labName}</p>
                <p>{report.lab.address}</p>
                <p>{t('labReport.phone')}: {report.lab.phone}</p>
                <p>{report.lab.email}</p>
              </div>
              <div className="flex items-end gap-3">
                <div className="text-[10px] text-muted-foreground max-w-[200px]">
                  {t('labReport.legal')}
                </div>
                <div className="bg-white p-1.5 rounded border border-[#C9A86A]/30">
                  <QRCode value={report.verifyUrl} size={56} level="M" />
                </div>
              </div>
            </div>
            <p className="lab-report-page-number text-center text-[10px] text-muted-foreground mt-4 print:block hidden" />
          </footer>
        </div>
      </motion.div>
    </div>
  );
}
