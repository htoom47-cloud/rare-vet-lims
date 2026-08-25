import { Navigate, Outlet, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function AdminNav({ user, onNavigate }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV.filter(([, , perm]) => !perm || can(user, perm)).map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/admin"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              isActive ? "bg-white/15 text-sand" : "text-white/80 hover:bg-white/10"
            }`
          }
        >
          {label}
        </NavLink>
      ))}
      <Link
        to="/"
        onClick={onNavigate}
        className="mt-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white/70 hover:bg-white/10"
      >
        عرض المتجر
      </Link>
    </nav>
  );
}

export function AdminLayout() {
  const [state, setState] = useState("loading");
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function logout() {
    await api.logout();
    navigate("/admin/login");
  }

  if (state === "loading") return <div className="p-10 text-center">...</div>;
  if (state === "no") return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-[#f4efe6] lg:flex" dir="rtl">
      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(18rem,86vw)] flex-col bg-ink text-white shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shadow-none ${
          menuOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <strong>لوحة تطمن</strong>
          <button type="button" className="rounded-lg p-1 lg:hidden" aria-label="إغلاق" onClick={() => setMenuOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        <AdminNav user={user} onNavigate={() => setMenuOpen(false)} />
        <div className="border-t border-white/10 p-4">
          <p className="text-xs text-white/60">{user?.name}</p>
          <button type="button" className="mt-2 text-sm font-bold text-sand" onClick={logout}>
            خروج
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white lg:hidden">
          <button
            type="button"
            className="rounded-lg p-1"
            aria-label="فتح القائمة"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
          </button>
          <strong>لوحة تطمن</strong>
          <button type="button" className="text-xs font-bold" onClick={logout}>
            خروج
          </button>
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet context={{ user }} />
        </div>
      </div>
    </div>
  );
}
