import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, LogOut, Eye, Download, Globe, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../context/PortalContext';
import { useTheme } from '../context/ThemeContext';
import AppLogo from '../components/ui/AppLogo';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { portalReportsAPI } from '../services/portalApi';

const ANIMAL_TYPES = {
  camel: { en: 'Camel', ar: 'إبل' },
  horse: { en: 'Horse', ar: 'حصان' },
  sheep: { en: 'Sheep', ar: 'غنم' },
  goat: { en: 'Goat', ar: 'ماعز' },
  bird: { en: 'Bird', ar: 'طير' },
  cat: { en: 'Cat', ar: 'قط' },
  dog: { en: 'Dog', ar: 'كلب' },
};

export default function PortalReports() {
  const { t, i18n } = useTranslation();
  const { customer, logout } = usePortal();
  const { toggleLanguage, theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAr = i18n.language === 'ar';
  const displayName = isAr ? (customer?.full_name_ar || customer?.full_name) : customer?.full_name;

  useEffect(() => {
    portalReportsAPI.list()
      .then(({ data }) => setReports(data.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const animalLabel = (type) => {
    const e = ANIMAL_TYPES[type];
    return e ? (isAr ? e.ar : e.en) : (type || '—');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openPdf = async (report) => {
    try {
      await portalReportsAPI.openPdf(report.pdf_url);
    } catch {
      toast.error(t('labReport.downloadFailed'));
    }
  };

  return (
    <div className="min-h-screen bg-background bg-app-mesh" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-20 border-b border-border/60 bg-card/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AppLogo size="sm" />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{t('portal.title')}</p>
              <p className="text-xs text-muted-foreground truncate">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button type="button" variant="ghost" size="icon" onClick={toggleLanguage}>
              <Globe size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={handleLogout} title={t('portal.logout')}>
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">{t('portal.myReports')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('portal.reportsHint')}</p>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
        )}

        {!loading && reports.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText size={40} className="mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">{t('portal.noReports')}</p>
            </CardContent>
          </Card>
        )}

        {!loading && reports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
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
                {report.animal_code && (
                  <div>
                    <dt className="text-muted-foreground">{t('animals.animalId')}</dt>
                    <dd>{report.animal_code}{report.animal_name ? ` — ${report.animal_name}` : ''}</dd>
                  </div>
                )}
                {report.animal_type && (
                  <div>
                    <dt className="text-muted-foreground">{t('animals.type')}</dt>
                    <dd>{animalLabel(report.animal_type)}</dd>
                  </div>
                )}
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="default" className="gap-1.5" onClick={() => navigate(`/reports/${report.id}`)}>
                  <Eye size={14} /> {t('common.view')}
                </Button>
                {report.pdf_url && (
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => openPdf(report)}>
                    <Download size={14} /> PDF
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
