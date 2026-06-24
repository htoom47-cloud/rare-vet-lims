import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, AlertTriangle } from 'lucide-react';
import { portalDashboardAPI } from '../../services/portalApi';

const POLL_MS = 5 * 60 * 1000;

export default function PortalNotifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const loadAlerts = () => {
    portalDashboardAPI.get()
      .then(({ data }) => setAlerts(data.data?.alerts || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadAlerts();
    const timer = setInterval(loadAlerts, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const alertText = (alert) => {
    if (alert.type === 'new_reports') return t('portal.alertNewReports', { count: alert.count });
    if (alert.type === 'critical_results') return t('portal.alertCritical', { count: alert.count });
    if (alert.type === 'abnormal_panels') return t('portal.alertAbnormal', { count: alert.count });
    return '';
  };

  const alertClass = (severity) => {
    if (severity === 'critical') return 'portal-alert-critical';
    if (severity === 'warning') return 'portal-alert-info';
    return 'bg-primary-50 border border-primary-200 text-primary-800 dark:bg-primary-900/30 dark:border-primary-700 dark:text-primary-100';
  };

  if (!alerts.length) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative p-2 rounded-xl hover:bg-accent text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('portal.notifications')}
      >
        <Bell size={20} />
        <span className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-rose-500 text-[10px] text-white flex items-center justify-center font-bold">
          {alerts.length > 9 ? '9+' : alerts.length}
        </span>
      </button>

      {open && (
        <div className="absolute top-full mt-2 end-0 w-72 max-w-[90vw] z-50 bg-card border border-border rounded-xl shadow-card-hover overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-foreground">{t('portal.notifications')}</p>
          </div>
          <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto">
            {alerts.map((alert) => (
              <button
                key={alert.type}
                type="button"
                className={`w-full text-start px-3 py-2 rounded-lg text-xs font-medium flex items-start gap-2 ${alertClass(alert.severity)}`}
                onClick={() => {
                  setOpen(false);
                  navigate(alert.type === 'new_reports' ? '/reports' : '/');
                }}
              >
                {alert.severity === 'critical' ? <AlertTriangle size={14} className="shrink-0 mt-0.5" /> : <Bell size={14} className="shrink-0 mt-0.5" />}
                <span>{alertText(alert)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
