import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { useLang } from "../context/LangContext";
import { WHATSAPP } from "../data/products";

export function Footer() {
  const { t } = useLang();

  return (
    <footer className="mt-20 border-t border-navy/10 bg-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo className="items-start text-start text-white [&_*]:text-white" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            {t(
              "متجر تطمن للمنتجات البيطرية المميزة — جودة احترافية لخيول السباق والإبل والمواشي في قطر والخليج.",
              "Tatman specialty veterinary store — professional-grade care for race horses, camels, and livestock across Qatar & the Gulf.",
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
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-ink"
          >
            WhatsApp +974 5121 1169
          </a>
          <p className="mt-3 font-arabic text-2xl font-extrabold text-white/90">الصيدلية</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/45">
        © {new Date().getFullYear()} Tatman Veterinary Services · تطمن للخدمات البيطرية
      </div>
    </footer>
  );
}
