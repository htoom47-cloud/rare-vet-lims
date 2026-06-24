import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { portalInvoicesAPI } from '../services/portalApi';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

export default function PortalInvoices() {
  const { t, i18n } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(null);
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    portalInvoicesAPI.list({ limit: 100 })
      .then(({ data }) => setInvoices(data.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const openPdf = async (id) => {
    setPdfLoading(id);
    try {
      await portalInvoicesAPI.openPdf(id);
    } catch {
      toast.error(t('billing.pdfFailed'));
    } finally {
      setPdfLoading(null);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const totalDue = invoices.reduce((s, i) => s + parseFloat(i.balance_due || 0), 0);

  return (
    <PortalLayout title={t('portal.myInvoices')} subtitle={t('portal.invoicesHint')} wide>
      {!loading && invoices.length > 0 && (
        <div className="premium-card px-4 py-3 mb-3 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{t('billing.balanceDue')}</span>
          <span className="text-lg font-bold text-amber-700">{fmt(totalDue)}</span>
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && invoices.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('portal.noInvoices')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {!loading && invoices.map((inv) => (
          <div key={inv.id} className="premium-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{inv.invoice_number}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDate(inv.created_at)}</p>
            </div>
            <div className="text-end">
              <p className="font-bold">{fmt(inv.total)}</p>
              {parseFloat(inv.balance_due) > 0.01 && (
                <p className="text-xs text-amber-700">{t('billing.balanceDue')}: {fmt(inv.balance_due)}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full bg-primary-100 text-primary-800 font-medium">
                {t(`billing.invoiceStatus.${inv.status}`, { defaultValue: inv.status })}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPdf(inv.id)}
                disabled={pdfLoading === inv.id}
              >
                <Download size={14} className="me-1" />
                {pdfLoading === inv.id ? t('common.loading') : t('billing.downloadPdf')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
}
