import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Image, Download, Share2, Printer, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import PortalLayout from '../components/portal/PortalLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { portalDocumentsAPI, portalReportsAPI } from '../services/portalApi';
import { animalLabel } from '../utils/animalTypes';

const resolveUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

export default function PortalDocuments() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const animalId = searchParams.get('animalId') || '';
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';

  useEffect(() => {
    const params = { type: filter === 'all' ? undefined : filter };
    if (animalId) params.animalId = animalId;
    portalDocumentsAPI.list(params)
      .then(({ data }) => setDocs(data.data))
      .catch(() => toast.error(t('portal.loadFailed')))
      .finally(() => setLoading(false));
  }, [filter, animalId, t]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const handleDownload = async (doc) => {
    if (doc.type === 'pdf' && doc.url) {
      try {
        await portalReportsAPI.openPdf(doc.url);
      } catch {
        toast.error(t('labReport.downloadFailed'));
      }
      return;
    }
    const url = resolveUrl(doc.url);
    if (url) window.open(url, '_blank');
  };

  const handleShare = async (doc) => {
    const url = doc.type === 'pdf'
      ? `${window.location.origin}/reports/${doc.reportId}`
      : resolveUrl(doc.url);
    if (navigator.share) {
      try {
        await navigator.share({ title: doc.title, url });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success(t('portal.linkCopied'));
    }
  };

  const filters = [
    { key: 'all', label: t('portal.docAll') },
    { key: 'pdf', label: t('portal.docPdf') },
    { key: 'image', label: t('portal.docImages') },
  ];

  return (
    <PortalLayout title={t('portal.documents')} subtitle={t('portal.documentsHint')} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">{t('common.loading')}</div>
      )}

      {!loading && docs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t('portal.noDocuments')}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!loading && docs.map((doc) => (
          <Card key={`${doc.type}-${doc.id}`} className="portal-doc-card overflow-hidden">
            <CardContent className="p-0">
              {doc.type === 'image' ? (
                <div className="aspect-video bg-muted relative overflow-hidden">
                  <img
                    src={resolveUrl(doc.url)}
                    alt={doc.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/15 flex items-center justify-center">
                  <FileText size={48} className="text-primary/40" />
                </div>
              )}
              <div className="p-4">
                <p className="font-semibold text-sm font-mono truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {doc.animalCode && `${doc.animalCode} · `}
                  {animalLabel(doc.animalType, isAr)}
                  {doc.animalName ? ` · ${doc.animalName}` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(doc.createdAt)}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Button size="sm" variant="secondary" className="gap-1 h-8" onClick={() => handleDownload(doc)}>
                    <Download size={14} /> {t('common.download')}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handleShare(doc)}>
                    <Share2 size={14} /> {t('portal.share')}
                  </Button>
                  {doc.reportId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 h-8"
                      onClick={() => navigate(`/reports/${doc.reportId}`)}
                    >
                      <Printer size={14} /> {t('common.view')}
                    </Button>
                  )}
                  {doc.type === 'image' && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground ms-auto">
                      <Image size={12} /> {t('portal.docImages')}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PortalLayout>
  );
}
