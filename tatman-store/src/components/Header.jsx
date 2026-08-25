import { NavLink, Link } from "react-router-dom";
import { Logo } from "./Logo";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { useCountry } from "../context/CountryContext";

const linkClass = ({ isActive }) =>
  `text-sm font-bold tracking-wide transition ${
    isActive ? "text-crimson" : "text-ink/75 hover:text-medical"
  }`;

export function Header() {
  const { t, toggle, lang } = useLang();
  const cart = useCart();
  const { country, setCountry } = useCountry();

  return (
    <header className="sticky top-0 z-40 border-b border-track/10 bg-paper/92 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        <Link to="/" className="shrink-0" aria-label="Tatman home">
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
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="min-h-10 rounded-full border border-medical/25 bg-white px-2 py-2 text-xs font-extrabold text-navy"
            aria-label={t("الدولة", "Country")}
          >
            <option value="qa">{t("قطر", "Qatar")}</option>
            <option value="sa">{t("السعودية", "KSA")}</option>
          </select>
          <button
            type="button"
            onClick={toggle}
            aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            className="min-h-10 rounded-full border border-medical/25 bg-white px-3.5 py-2 text-xs font-extrabold tracking-wide text-navy"
          >
            {lang === "ar" ? "EN" : "عربي"}
          </button>
          <Link
            to="/cart"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-navy px-3.5 py-2 text-sm font-bold text-white"
          >
            <span className="hidden xs:inline sm:inline">{t("السلة", "Cart")}</span>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1.5 text-[11px] font-bold">
              {cart.count}
            </span>
          </Link>
        </div>
      </div>

      <nav className="safe-bottom flex justify-around gap-1 border-t border-track/5 px-2 py-2 md:hidden">
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
