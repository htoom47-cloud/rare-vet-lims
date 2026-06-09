import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage } = useTheme();
  const { user } = useAuth();

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
