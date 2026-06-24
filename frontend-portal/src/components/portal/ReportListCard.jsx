import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { portalReportsAPI } from '../../services/portalApi';
import { animalLabel } from '../../utils/animalTypes';

function reportHeading(report, showAnimal) {
  if (showAnimal && report.animal_name) return report.animal_name;
  if (showAnimal && report.animal_code) return report.animal_code;
  return report.report_number;
}

function reportSubline(report, showAnimal, isAr, formatDate) {
  const parts = [];
  if (showAnimal && report.animal_name && report.animal_type) {
    parts.push(animalLabel(report.animal_type, isAr));
  }
  if (showAnimal && report.animal_code && report.animal_name) {
    parts.push(report.animal_code);
  }
  if (showAnimal && report.animal_name) {
    parts.push(report.report_number);
  }
  parts.push(formatDate(report.created_at));
  return parts.filter(Boolean).join(' · ');
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

  const heading = reportHeading(report, showAnimal);
  const hasAnimalName = showAnimal && !!report.animal_name;

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
        className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-start border border-slate-200/80 bg-white"
        onClick={() => navigate(`/reports/${report.id}`)}
      >
        <div className="min-w-0">
          <p className={`font-bold text-slate-900 truncate ${hasAnimalName ? 'text-base' : 'text-sm font-mono'}`}>
            {heading}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {hasAnimalName
              ? reportSubline(report, showAnimal, isAr, formatDate)
              : `${formatDate(report.created_at)}${report.animal_code ? ` · ${report.animal_code}` : ''}`}
          </p>
        </div>
        <Eye size={16} className="text-slate-400 shrink-0" />
      </button>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow border-slate-200/80 bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`leading-tight truncate ${hasAnimalName ? 'text-lg font-bold text-slate-900' : 'text-base font-mono font-semibold'}`}>
              {heading}
            </p>
            {hasAnimalName && (
              <p className="text-xs text-slate-500 font-normal mt-1 truncate">
                {reportSubline(report, showAnimal, isAr, formatDate)}
              </p>
            )}
          </div>
          <span className={`text-xs font-normal px-2 py-0.5 rounded-full shrink-0 ${report.is_final ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {report.is_final ? t('labReport.final') : t('labReport.preliminary')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {hasAnimalName && (
            <div>
              <dt className="text-muted-foreground">{t('reports.reportNo')}</dt>
              <dd className="font-mono text-xs">{report.report_number}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">{t('reports.sampleNo')}</dt>
            <dd className="font-mono text-xs">{report.sample_code}</dd>
          </div>
          {!hasAnimalName && (
            <div>
              <dt className="text-muted-foreground">{t('common.date')}</dt>
              <dd>{formatDate(report.created_at)}</dd>
            </div>
          )}
          {showAnimal && report.animal_code && !hasAnimalName && (
            <div>
              <dt className="text-muted-foreground">{t('animals.animalId')}</dt>
              <dd className="font-mono text-xs">{report.animal_code}</dd>
            </div>
          )}
          {showAnimal && report.animal_type && (
            <div>
              <dt className="text-muted-foreground">{t('animals.type')}</dt>
              <dd>{animalLabel(report.animal_type, isAr)}</dd>
            </div>
          )}
          {hasAnimalName && (
            <div>
              <dt className="text-muted-foreground">{t('animals.animalId')}</dt>
              <dd className="font-mono text-xs">{report.animal_code || '—'}</dd>
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
