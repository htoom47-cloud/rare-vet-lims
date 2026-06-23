import { Navigate } from 'react-router-dom';
import { usePortal } from '../../context/PortalContext';

export default function ProtectedPortalRoute({ children }) {
  const { customer, loading } = usePortal();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">...</div>
      </div>
    );
  }

  if (!customer) return <Navigate to="/login" replace />;
  return children;
}
