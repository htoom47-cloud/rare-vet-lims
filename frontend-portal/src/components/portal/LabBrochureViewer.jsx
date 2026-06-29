import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const BROCHURE_URL = '/lab-profile.pdf';

export default function LabBrochureViewer() {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(720);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const update = () => {
      const w = el.clientWidth;
      setPageWidth(Math.min(Math.max(w - 8, 280), 820));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full max-w-[52rem] mx-auto">
      {error ? (
        <div className="py-16 px-3 text-center space-y-4">
          <p className="text-sm text-muted-foreground">{t('home.pdfLoadError')}</p>
          <a
            href={BROCHURE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex"
          >
            {t('home.openPdf')}
          </a>
        </div>
      ) : (
        <Document
          file={BROCHURE_URL}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setError(true)}
          loading={(
            <div className="py-24 text-center text-muted-foreground text-sm animate-pulse">
              …
            </div>
          )}
          className="flex flex-col items-center gap-3 sm:gap-4"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <Page
              key={`page-${i + 1}`}
              pageNumber={i + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-md rounded-sm overflow-hidden bg-white [&_canvas]:!max-w-full [&_canvas]:h-auto"
            />
          ))}
        </Document>
      )}
    </div>
  );
}
