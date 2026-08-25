import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { useLang } from "../context/LangContext";
import { WHATSAPP } from "../data/products";

export function Footer() {
  const { t } = useLang();

  return (
    <footer className="mt-16 border-t border-track/10 bg-ink text-white sm:mt-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-14 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="inline-block rounded-2xl bg-paper p-3">
            <Logo compact className="h-16 sm:h-[4.5rem]" />
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            {t(
              "تطمن للخدمات البيطرية — منتجات مميزة للإبل والخيل والهجن. طلب من قطر والسعودية والخليج والعالم.",
              "Tatman Veterinary Services — specialty products for camels, horses, and hajjan. Orders from Qatar, Saudi Arabia, the Gulf, and worldwide.",
            )}
          </p>
        </div>
        <div>
          <h4 className="font-display text-sm tracking-[0.2em] text-sand">
            {t("روابط", "LINKS")}
          </h4>
          <div className="mt-4 flex flex-col gap-2 text-sm text-white/75">
            <Link to="/shop">{t("كل المنتجات", "All products")}</Link>
            <Link to="/contact">{t("الصيدلية / الطلب", "Pharmacy / Order")}</Link>
          </div>
        </div>
        <div>
          <h4 className="font-display text-sm tracking-[0.2em] text-sand">
            {t("تواصل", "CONTACT")}
          </h4>
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-bold text-ink"
          >
            WhatsApp +974 5121 1169
          </a>
          <p className="mt-3 font-arabic text-2xl font-extrabold text-white/90">الصيدلية</p>
          <p className="mt-2 text-xs text-white/50">
            {t("متاح للطلب من أي دولة", "Available for orders from any country")}
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/45">
        © {new Date().getFullYear()} Tatman Veterinary Services · تطمن للخدمات البيطرية
      </div>
    </footer>
  );
}
