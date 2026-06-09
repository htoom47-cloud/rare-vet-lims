import { useAuth } from '../../context/AuthContext';
import { isReception } from '../../utils/roles';
import Dashboard from '../../pages/Dashboard';
import ReceptionHome from '../../pages/ReceptionHome';

export default function RoleHome() {
  const { user } = useAuth();
  return isReception(user) ? <ReceptionHome /> : <Dashboard />;
}
