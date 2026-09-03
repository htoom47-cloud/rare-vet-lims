import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCatalog } from "../context/CatalogContext";
import { useLang } from "../context/LangContext";
import { BenefitBar } from "../components/BenefitBar";
import { ProductCard } from "../components/ProductCard";
import { Logo } from "../components/Logo";

export function Home() {
  const { t } = useLang();
  const { products } = useCatalog();
  const featured = products.slice(0, 6);

  return (
    <div>
      <section className="hero-shell">
        <picture>
          <source media="(max-width: 768px)" srcSet="/brand/hero-mobile.jpg" />
          <img
            src="/brand/hero-desktop.jpg"
            alt=""
            className="hero-photo"
            fetchPriority="high"
          />
        </picture>
        <div className="hero-scrim" aria-hidden />

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col items-center justify-center px-4 pb-32 pt-10 text-center sm:px-6 sm:pb-36">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
          >
            {/* Logo PNG shown exactly as provided — no recolor, no redraw */}
            <Logo />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.12 }}
            className="mt-8 max-w-3xl font-arabic text-[1.85rem] font-extrabold leading-tight text-white drop-shadow sm:text-5xl md:text-6xl"
          >
            {t(
              "منتجات بيطرية للإبل والخيل والهجن",
              "Veterinary care for camels, horses & hajjan",
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24 }}
            className="mt-4 max-w-xl text-sm leading-relaxed text-white/90 sm:text-lg"
          >
            {t(
              "تطمن — تركيبات احترافية من قلب الصحراء ومضمار السباق. نخدم قطر والسعودية والخليج والعالم عبر واتساب.",
              "Tatman — professional formulas from desert and track. Serving Qatar, Saudi Arabia, the Gulf, and worldwide via WhatsApp.",
            )}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.36 }}
            className="mt-8 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center"
          >
            <Link
              to="/shop"
              className="min-h-12 rounded-full bg-crimson px-7 py-3.5 text-center text-sm font-extrabold text-white shadow-lg shadow-black/25"
            >
              {t("تسوق الآن", "Shop now")}
            </Link>
            <Link
              to="/contact"
              className="min-h-12 rounded-full border border-white/50 bg-white/15 px-7 py-3.5 text-center text-sm font-extrabold text-white backdrop-blur"
            >
              {t("اطلب عبر واتساب", "Order on WhatsApp")}
            </Link>
          </motion.div>

          <p className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-sand uppercase sm:text-xs">
            {t("قطر · السعودية · الخليج · عالمي", "Qatar · KSA · Gulf · Worldwide")}
          </p>
        </div>
      </section>

      <BenefitBar />

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="mb-8 max-w-2xl sm:mb-10">
          <p className="font-display text-sm tracking-[0.25em] text-medical">
            {t("المجموعة", "COLLECTION")}
          </p>
          <h2 className="mt-2 font-arabic text-3xl font-extrabold text-ink sm:text-4xl">
            {t("مختارات للإبل والخيل والهجن", "Selected for camels, horses & hajjan")}
          </h2>
          <p className="mt-3 text-sm text-ink/65 sm:text-base">
            {t(
              "أداء · طاقة · مفاصل · خصوبة · مناعة — بتركيبات واضحة وطلب سهل من الجوال.",
              "Performance · Energy · Joints · Fertility · Immunity — clear formulas, mobile-first ordering.",
            )}
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {featured.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/shop"
            className="inline-flex min-h-12 items-center rounded-full border border-medical/30 bg-white px-6 py-3 text-sm font-bold text-navy"
          >
            {t("عرض كل المنتجات", "View all products")}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        <div className="overflow-hidden rounded-[1.75rem] bg-navy text-white shadow-[0_24px_60px_rgba(26,61,58,0.28)] sm:rounded-[2rem]">
          <div className="grid md:grid-cols-2">
            <div className="space-y-4 p-7 sm:p-12">
              <p className="font-display text-sm tracking-[0.25em] text-sand">HAJJAN · خيل · إبل</p>
              <h2 className="font-arabic text-2xl font-extrabold sm:text-3xl">
                {t(
                  "من مضمار الهجن إلى الإسطبل — بنفس الثقة",
                  "From the hajjan track to the stable — same trust",
                )}
              </h2>
              <p className="text-sm leading-relaxed text-white/75 sm:text-base">
                {t(
                  "متجر ثنائي اللغة، مناسب للجوال، والطلب يصل عبر واتساب من قطر والسعودية وأي دولة.",
                  "Bilingual store, built for mobile, with WhatsApp ordering from Qatar, Saudi Arabia, or any country.",
                )}
              </p>
            </div>
            <div
              className="relative min-h-48 bg-cover bg-center sm:min-h-56"
              style={{ backgroundImage: "url(/brand/hero-mobile.jpg)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-track/30" />
              <div className="relative flex h-full min-h-48 items-end justify-center p-8 sm:min-h-56">
                <p className="font-arabic text-4xl font-extrabold text-sand/95">الصيدلية</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
