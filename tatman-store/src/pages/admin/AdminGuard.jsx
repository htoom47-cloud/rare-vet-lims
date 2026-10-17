import { useOutletContext } from "react-router-dom";
import { can } from "../../data/permissions";

export function AdminGuard({ perm, children }) {
  const { user } = useOutletContext();
  if (!can(user, perm)) {
    return <p className="text-crimson">لا تملك صلاحية الوصول إلى هذه الصفحة.</p>;
  }
  return children;
}
