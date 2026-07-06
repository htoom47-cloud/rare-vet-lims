import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

/**
 * Renders official report HTML (design 3) — same source as stored PDF.
 */
const ReportHtmlFrame = forwardRef(function ReportHtmlFrame({ html, title = 'Lab Report' }, ref) {
  const iframeRef = useRef(null);

  useImperativeHandle(ref, () => ({
    print: () => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return false;
      win.focus();
      win.print();
      return true;
    },
  }));

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !html) return;
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  if (!html) return null;

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className="report-html-frame w-full border-0 bg-white shadow-lg rounded-sm"
      style={{ minHeight: '1122px', height: 'calc(100vh - 220px)' }}
      sandbox="allow-same-origin allow-modals"
    />
  );
});

export default ReportHtmlFrame;
