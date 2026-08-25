import { Navigate, Outlet, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../../api";

export function AdminLayout() {
  const [state, setState] = useState("loading");
  const navigate = useNavigate();

  useEffect(() => {
    api.session().then((d) => setState(d.ok ? "ok" : "no")).catch(() => setState("no"));
  }, []);

  if (state === "loading") return <div className="p-10 text-center">...</div>;
  if (state === "no") return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-[#f4efe6]" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-ink px-4 py-3 text-white">
        <strong>لوحة تطمن</strong>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link to="/admin">الرئيسية</Link>
          <Link to="/admin/products">المنتجات</Link>
          <Link to="/admin/orders">الطلبات</Link>
          <Link to="/admin/coupons">أكواد الخصم</Link>
          <Link to="/admin/settings">الإعدادات</Link>
          <Link to="/">عرض المتجر</Link>
        </nav>
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
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </div>
    </div>
  );
}
