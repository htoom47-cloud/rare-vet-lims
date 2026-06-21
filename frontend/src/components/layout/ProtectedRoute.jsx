import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { userRole } from '../../utils/roles';
import AppLogo from '../ui/AppLogo';

export default function ProtectedRoute({ children, permission, adminOnly = false }) {
  const { t } = useTranslation();
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-primary-50 dark:bg-primary-900 bg-app-mesh gap-4">
        <AppLogo size="md" />
        <div className="animate-spin w-8 h-8 border-[3px] border-primary-300 border-t-primary-600 rounded-full" />
        <p className="text-sm text-primary-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && userRole(user) !== 'admin') return <Navigate to="/" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />;

  return children;
}
