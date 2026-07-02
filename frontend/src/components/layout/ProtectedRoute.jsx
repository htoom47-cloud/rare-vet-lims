import { Navigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { userRole } from '../../utils/roles';
import AppLogo from '../ui/AppLogo';

export default function ProtectedRoute({ children, permission, permissions, adminOnly = false }) {
  const { t } = useTranslation();
  const { user, loading, hasPermission, hasAnyPermission } = useAuth();
  const deniedToast = useRef(false);

  const denied = !loading && user && (
    (adminOnly && userRole(user) !== 'admin')
    || (permissions?.length && !hasAnyPermission(...permissions))
    || (permission && !hasPermission(permission))
  );

  useEffect(() => {
    if (denied && !deniedToast.current) {
      deniedToast.current = true;
      toast.error(t('common.accessDenied'));
    }
    if (!denied) deniedToast.current = false;
  }, [denied, t]);

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
  if (denied) return <Navigate to="/" replace />;

  return children;
}
