import { Navigate, Outlet, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { can } from "../../data/permissions";

const NAV = [
  ["/admin", "الرئيسية", ""],
  ["/admin/products", "المنتجات", "products"],
  ["/admin/orders", "الطلبات", "orders"],
  ["/admin/customers", "العملاء", "customers"],
  ["/admin/coupons", "أكواد الخصم", "coupons"],
  ["/admin/revenue", "الإيرادات", "revenue"],
  ["/admin/users", "المستخدمون", "users"],
  ["/admin/settings", "الإعدادات", "settings"],
];

export function AdminLayout() {
  const [state, setState] = useState("loading");
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .session()
      .then((d) => {
        if (d.ok && d.user) {
          setUser(d.user);
          setState("ok");
        } else {
          setState("no");
        }
      })
      .catch(() => setState("no"));
  }, []);

  if (state === "loading") return <div className="p-10 text-center">...</div>;
  if (state === "no") return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-[#f4efe6]" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-ink px-4 py-3 text-white">
        <strong>لوحة تطمن</strong>
        <nav className="flex flex-wrap gap-3 text-sm">
          {NAV.map(([to, label, perm]) =>
            !perm || can(user, perm) ? (
              <Link key={to} to={to}>
                {label}
              </Link>
            ) : null,
          )}
          <Link to="/">عرض المتجر</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/70">{user?.name}</span>
          <button
            type="button"
            className="text-xs"
            onClick={async () => {
              await api.logout();
              navigate("/admin/login");
            }}
          >
            خروج
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Outlet context={{ user }} />
      </div>
    </div>
  );
}
