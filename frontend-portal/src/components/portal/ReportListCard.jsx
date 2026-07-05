import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { portalReportsAPI } from '../../services/portalApi';
import { animalLabel } from '../../utils/animalTypes';
import { cn } from '../../lib/utils';

function reportTitle(report, showAnimal, isAr) {
  if (showAnimal && report.animal_name) return report.animal_name;
  if (showAnimal && report.animal_type) return animalLabel(report.animal_type, isAr);
  return report.report_number;
}

export default function ReportListCard({ report, isAr, showAnimal = true, compact = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const hasAnimalName = showAnimal && !!report.animal_name;
  const title = reportTitle(report, showAnimal, isAr);

  const openPdf = async () => {
    try {
      await portalReportsAPI.openPdf(report.pdf_url);
    } catch {
      toast.error(t('labReport.downloadFailed'));
    }
  };

  const titleBlock = (
    <>
      <p className={cn(
        'font-bold text-foreground leading-tight truncate',
        hasAnimalName ? 'text-lg' : 'text-base font-mono'
      )}
      >
        {title}
      </p>
      {hasAnimalName && report.animal_type && (
        <p className="text-sm text-muted-foreground mt-0.5 truncate">
          {animalLabel(report.animal_type, isAr)}
        </p>
      )}
      {showAnimal && report.animal_code && (
        <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
          {report.animal_code}
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-1 truncate">
        {report.report_number}
        {report.sample_code ? ` · ${report.sample_code}` : ''}
        {' · '}
        {formatDate(report.created_at)}
      </p>
    </>
  );

  if (compact) {
    return (
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:-translate-y-0.5 transition-all text-start premium-card premium-card-interactive"
        onClick={() => navigate(`/reports/${report.id}`)}
      >
        <div className="min-w-0 flex-1">{titleBlock}</div>
        <Eye size={16} className="text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <Card className="portal-report-card transition-all border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{titleBlock}</div>
          <span className={`text-xs font-normal px-2 py-0.5 rounded-full shrink-0 ${report.is_final ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
            {report.is_final ? t('labReport.final') : t('labReport.preliminary')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('reports.sampleNo')}</dt>
            <dd className="font-mono text-xs">{report.sample_code}</dd>
          </div>
          {showAnimal && report.animal_type && (
            <div>
              <dt className="text-muted-foreground">{t('animals.type')}</dt>
              <dd>{animalLabel(report.animal_type, isAr)}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="default" className="gap-1.5" onClick={() => navigate(`/reports/${report.id}`)}>
            <Eye size={14} /> {t('common.view')}
          </Button>
          {report.pdf_url && (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={openPdf}>
              <Download size={14} /> PDF
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
