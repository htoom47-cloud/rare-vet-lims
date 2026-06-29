import { useEffect, useRef, useState } from 'react';
import { m, useInView } from 'framer-motion';

export function AnimatedCounter({ value, suffix = '', duration = 1.4 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(0);
  const target = typeof value === 'number' ? value : 0;

  useEffect(() => {
    if (!inView || !target) return undefined;
    let start = 0;
    const startTime = performance.now();
    const tick = (now) => {
      const p = Math.min((now - startTime) / (duration * 1000), 1);
      const eased = 1 - (1 - p) ** 3;
      start = Math.round(target * eased);
      setDisplay(start);
      if (p < 1) requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [inView, target, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}{suffix}
    </span>
  );
}

export function Section({ id, className = '', children }) {
  return (
    <section id={id} className={`site-section ${className}`}>{children}</section>
  );
}

export function SectionHeader({ eyebrow, title, subtitle, align = 'start' }) {
  const alignCls = align === 'center' ? 'text-center mx-auto' : 'text-start';
  return (
    <div className={`max-w-3xl mb-10 lg:mb-14 ${alignCls}`}>
      {eyebrow && <p className="site-eyebrow mb-3">{eyebrow}</p>}
      {title && <h2 className="site-heading">{title}</h2>}
      {subtitle && <p className="site-subheading mt-4">{subtitle}</p>}
    </div>
  );
}

export function FadeUp({ children, className = '', delay = 0 }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </m.div>
  );
}
