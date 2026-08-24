import { NavLink, Link } from "react-router-dom";
import { Logo } from "./Logo";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";

const linkClass = ({ isActive }) =>
  `text-sm font-semibold tracking-wide transition ${
    isActive ? "text-crimson" : "text-ink/75 hover:text-navy"
  }`;

export function Header() {
  const { t, toggle, lang } = useLang();
  const cart = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-navy/10 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="text-ink">
          <Logo compact />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <NavLink to="/" end className={linkClass}>
            {t("الرئيسية", "Home")}
          </NavLink>
          <NavLink to="/shop" className={linkClass}>
            {t("المنتجات", "Shop")}
          </NavLink>
          <NavLink to="/contact" className={linkClass}>
            {t("تواصل", "Contact")}
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            className="rounded-full border border-navy/15 bg-white px-3 py-1.5 text-xs font-bold tracking-wide text-navy hover:border-medical"
          >
            {lang === "ar" ? "EN" : "عربي"}
          </button>
          <Link
            to="/cart"
            className="relative inline-flex items-center gap-2 rounded-full bg-navy px-3.5 py-2 text-sm font-semibold text-white"
          >
            <span>{t("السلة", "Cart")}</span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1.5 text-[11px] font-bold">
              {cart.count}
            </span>
          </Link>
        </div>
      </div>
      <nav className="flex justify-center gap-5 border-t border-navy/5 py-2 md:hidden">
        <NavLink to="/" end className={linkClass}>
          {t("الرئيسية", "Home")}
        </NavLink>
        <NavLink to="/shop" className={linkClass}>
          {t("المنتجات", "Shop")}
        </NavLink>
        <NavLink to="/contact" className={linkClass}>
          {t("تواصل", "Contact")}
        </NavLink>
      </nav>
    </header>
  );
}
