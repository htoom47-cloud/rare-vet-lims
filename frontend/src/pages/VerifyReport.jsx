import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import AppLogo from '../components/ui/AppLogo';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { reportsAPI } from '../services/api';

export default function VerifyReport() {
  const { code } = useParams();
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    reportsAPI.verify(code)
      .then(({ data }) => setResult(data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [code]);

  const isAr = i18n.language === 'ar';

  return (
    <div className="min-h-screen bg-[#F7F5F2] dark:bg-[#1a1512] flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <AppLogo size="lg" className="mx-auto mb-3" />
          <h1 className="text-xl font-bold text-[#5B3A29] dark:text-[#F7F5F2]">{t('reports.verify')}</h1>
        </div>

        <Card className="border-[#C9A86A]/30">
          <CardContent className="pt-6">
            {loading && <Skeleton className="h-24 w-full" />}
            {!loading && result && (
              <div className="text-center space-y-3">
                <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">{t('reports.validReport')}</p>
                <dl className="text-sm space-y-1 text-start">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('reports.reportNo')}</dt>
                    <dd className="font-mono font-medium">{result.report_number}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('reports.sampleNo')}</dt>
                    <dd className="font-mono">{result.sample_code}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{t('customers.fullName')}</dt>
                    <dd>{result.customer_name}</dd>
                  </div>
                </dl>
              </div>
            )}
            {!loading && error && (
              <div className="text-center space-y-3">
                <XCircle size={48} className="mx-auto text-red-500" />
                <p className="font-semibold text-red-600">{t('reports.invalidCode')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1">
          <ShieldCheck size={12} />
          {t('app.name')}
        </p>
      </motion.div>
    </div>
  );
}
