import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

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
    const fit = () => {
      const body = doc.body;
      if (!body) return;
      const height = Math.max(body.scrollHeight, body.offsetHeight, 800);
      frame.style.height = `${height + 24}px`;
    };
    fit();
    requestAnimationFrame(fit);
    const images = Array.from(doc.images || []);
    images.forEach((img) => {
      if (!img.complete) img.addEventListener('load', fit, { once: true });
    });
  }, [html]);

  if (!html) return null;

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className="report-html-frame w-full border-0 bg-white shadow-lg rounded-sm"
      style={{ minHeight: '800px', height: 'auto', overflow: 'hidden' }}
      sandbox="allow-same-origin allow-modals"
    />
  );
});

export default ReportHtmlFrame;
