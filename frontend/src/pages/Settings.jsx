import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { notificationsAPI, settingsAPI } from '../services/api';

const StatusDot = ({ ok }) => (
  <span className={`inline-block w-3 h-3 rounded-full mr-2 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
);

export default function Settings() {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage } = useTheme();
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role_name === 'admin';
  const canManageSettings = hasPermission('settings.manage');
  const canViewSettings = hasPermission('settings.view') || canManageSettings;

  const [notifConfig, setNotifConfig] = useState(null);
  const [testNumber, setTestNumber] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [disableCriticalFlags, setDisableCriticalFlags] = useState(false);
  const [criticalSaving, setCriticalSaving] = useState(false);

  useEffect(() => {
    if (isAdmin || canManageSettings) {
      notificationsAPI.configStatus()
        .then(({ data }) => setNotifConfig(data.data))
        .catch(() => {});
    }
  }, [isAdmin, canManageSettings]);

  useEffect(() => {
    if (!canViewSettings) return;
    settingsAPI.get()
      .then(({ data }) => {
        const raw = data.data?.disable_critical_flags;
        setDisableCriticalFlags(raw === true || raw === 'true');
      })
      .catch(() => {});
  }, [canViewSettings]);

  const handleCriticalToggle = async () => {
    if (!canManageSettings) return;
    const next = !disableCriticalFlags;
    setCriticalSaving(true);
    try {
      await settingsAPI.update('disable_critical_flags', next);
      setDisableCriticalFlags(next);
      toast.success(next
        ? t('settings.criticalDisabledToast')
        : t('settings.criticalEnabledToast'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    } finally {
      setCriticalSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!testNumber.trim()) return;
    setTestSending(true);
    try {
      const { data: resp } = await notificationsAPI.testSend('sms', testNumber.trim());
      if (resp.dryRun) {
        toast(t('notifications.testSendDryRun'), { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(t('notifications.testSendSuccess'));
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Error');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('settings.title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card space-y-4">
          <h3 className="font-semibold">{t('settings.language')}</h3>
          <div className="flex gap-2">
            <button onClick={() => setLanguage('en')} className={`px-4 py-2 rounded-lg ${language === 'en' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>English</button>
            <button onClick={() => setLanguage('ar')} className={`px-4 py-2 rounded-lg ${language === 'ar' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>العربية</button>
          </div>
        </div>

        <div className="card space-y-4">
          <h3 className="font-semibold">{t('settings.theme')}</h3>
          <div className="flex gap-2">
            <button onClick={() => setTheme('light')} className={`px-4 py-2 rounded-lg ${theme === 'light' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{t('settings.light')}</button>
            <button onClick={() => setTheme('dark')} className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{t('settings.dark')}</button>
          </div>
        </div>

        <div className="card space-y-4 md:col-span-2">
          <h3 className="font-semibold">Profile</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Name:</span> {user?.full_name}</div>
            <div><span className="text-gray-500">Email:</span> {user?.email}</div>
            <div><span className="text-gray-500">Role:</span> <span className="capitalize">{user?.role?.replace('_', ' ')}</span></div>
            <div><span className="text-gray-500">Permissions:</span> {user?.permissions?.length || 0}</div>
          </div>
        </div>

        {notifConfig && (
          <div className="card space-y-4 md:col-span-2">
            <h3 className="font-semibold">{t('notifications.statusTitle')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center">
                <StatusDot ok={notifConfig.smsEnabled} />
                <div>
                  <p className="text-gray-500">{t('notifications.smsEnabled')}</p>
                  <p className="font-medium">{notifConfig.smsEnabled ? t('notifications.enabled') : t('notifications.disabled')}</p>
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center">
                <StatusDot ok={notifConfig.whatsappEnabled} />
                <div>
                  <p className="text-gray-500">{t('notifications.whatsappEnabled')}</p>
                  <p className="font-medium">{notifConfig.whatsappEnabled ? t('notifications.enabled') : t('notifications.disabled')}</p>
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center">
                <StatusDot ok={notifConfig.sendReal} />
                <div>
                  <p className="text-gray-500">{t('notifications.realSending')}</p>
                  <p className="font-medium">{notifConfig.sendReal ? t('notifications.enabled') : t('notifications.disabled')}</p>
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center">
                <StatusDot ok={notifConfig.msegatConfigured} />
                <div>
                  <p className="text-gray-500">{t('notifications.msegatConnected')}</p>
                  <p className="font-medium">{notifConfig.msegatConfigured ? t('notifications.enabled') : t('notifications.disabled')}</p>
                </div>
              </div>
            </div>

            {notifConfig.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.sent')}</p>
                  <p className="font-bold text-green-600 text-xl">{notifConfig.stats.sent_today || 0}</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.failed')}</p>
                  <p className="font-bold text-red-600 text-xl">{notifConfig.stats.failed_today || 0}</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.dryRun')}</p>
                  <p className="font-bold text-yellow-600 text-xl">{notifConfig.stats.dry_run_today || 0}</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.pending')}</p>
                  <p className="font-bold text-blue-600 text-xl">{notifConfig.stats.pending_today || 0}</p>
                </div>
              </div>
            )}

            {canManageSettings && (
              <div className="flex gap-2 items-end mt-2">
                <div className="flex-1">
                  <label className="text-sm text-gray-500 block mb-1">{t('notifications.testRecipient')}</label>
                  <input
                    type="text"
                    placeholder="05xxxxxxxx"
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <button
                  onClick={handleTestSend}
                  disabled={testSending || !testNumber.trim()}
                  className="btn btn-primary whitespace-nowrap"
                >
                  {testSending ? '...' : t('notifications.testSend')}
                </button>
              </div>
            )}
          </div>
        )}

        {canViewSettings && (
          <div className="card space-y-4 md:col-span-2">
            <h3 className="font-semibold">{t('settings.criticalFlagsTitle')}</h3>
            <p className="text-sm text-gray-500">{t('settings.criticalFlagsHint')}</p>
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div>
                <p className="font-medium">{t('settings.disableCriticalFlags')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('settings.criticalFlagsKeepHighLow')}</p>
              </div>
              <button
                type="button"
                disabled={!canManageSettings || criticalSaving}
                onClick={handleCriticalToggle}
                className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                  disableCriticalFlags
                    ? 'bg-amber-600 text-white'
                    : 'bg-primary-600 text-white'
                }`}
              >
                {criticalSaving
                  ? '...'
                  : (disableCriticalFlags
                    ? t('settings.criticalOff')
                    : t('settings.criticalOn'))}
              </button>
            </div>
          </div>
        )}

        <div className="card space-y-4 md:col-span-2">
          <h3 className="font-semibold">System Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-500">Version</p>
              <p className="font-medium">1.0.0</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-500">API</p>
              <p className="font-medium">REST + JWT</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-500">Notifications</p>
              <p className="font-medium">WhatsApp, SMS, Email (Ready)</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-gray-500">Devices</p>
              <p className="font-medium">HL7, ASTM, TCP, Serial</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
