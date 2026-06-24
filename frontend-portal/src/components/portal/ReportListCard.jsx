import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { portalReportsAPI } from '../../services/portalApi';
import { animalLabel } from '../../utils/animalTypes';

export default function ReportListCard({ report, isAr, showAnimal = true, compact = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const openPdf = async () => {
    try {
      await portalReportsAPI.openPdf(report.pdf_url);
    } catch {
      toast.error(t('labReport.downloadFailed'));
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-accent/60 transition-colors text-start border border-border/50"
        onClick={() => navigate(`/reports/${report.id}`)}
      >
        <div className="min-w-0">
          <p className="font-mono font-medium text-sm">{report.report_number}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(report.created_at)}
            {showAnimal && report.animal_code ? ` · ${report.animal_code}` : ''}
          </p>
        </div>
        <Eye size={16} className="text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="font-mono">{report.report_number}</span>
          <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${report.is_final ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
            {report.is_final ? t('labReport.final') : t('labReport.preliminary')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('reports.sampleNo')}</dt>
            <dd className="font-mono">{report.sample_code}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('common.date')}</dt>
            <dd>{formatDate(report.created_at)}</dd>
          </div>
          {showAnimal && report.animal_code && (
            <div>
              <dt className="text-muted-foreground">{t('animals.animalId')}</dt>
              <dd>{report.animal_code}{report.animal_name ? ` — ${report.animal_name}` : ''}</dd>
            </div>
          )}
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
