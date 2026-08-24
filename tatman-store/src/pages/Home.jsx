import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { products } from "../data/products";
import { useLang } from "../context/LangContext";
import { BenefitBar } from "../components/BenefitBar";
import { ProductCard } from "../components/ProductCard";
import { Logo } from "../components/Logo";

export function Home() {
  const { t } = useLang();
  const featured = products.slice(0, 6);

  return (
    <div>
      <section
        className="hero-atmosphere dune-pattern relative min-h-[88vh] overflow-hidden text-white"
        style={{ color: "#fff" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[#0f1724]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(15,23,36,0.2) 0%, rgba(20,33,61,0.45) 50%, rgba(8,12,20,0.85) 100%), radial-gradient(ellipse at 30% 75%, rgba(201,164,106,0.4), transparent 55%)",
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-drift absolute -start-10 bottom-16 h-40 w-[120%] opacity-40">
            <svg viewBox="0 0 1200 200" className="h-full w-full" preserveAspectRatio="none">
              <path
                d="M0 140 C120 80 220 160 340 110 C460 60 560 150 700 100 C840 50 960 140 1200 90 L1200 200 L0 200 Z"
                fill="rgba(201,164,106,0.45)"
              />
            </svg>
          </div>
          <div className="absolute bottom-0 start-0 end-0 flex justify-between px-6 text-white/45 sm:px-16">
            <HorseSilhouette className="h-28 w-36 sm:h-40 sm:w-52" />
            <CamelSilhouette className="hidden h-36 w-48 sm:block" />
            <HorseSilhouette className="h-24 w-32 scale-x-[-1] sm:h-36 sm:w-44" />
          </div>
        </div>

        <div className="relative z-10 mx-auto flex min-h-[88vh] max-w-7xl flex-col items-center justify-center px-4 pb-28 pt-16 text-center sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-white"
          >
            <Logo className="text-white" light />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.15 }}
            className="mt-10 max-w-3xl font-arabic text-4xl font-extrabold leading-tight text-white sm:text-5xl md:text-6xl"
          >
            {t("منتجات بيطرية مميزة… تطمن", "Specialty veterinary products. Rest assured.")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg"
          >
            {t(
              "تركيبات احترافية لخيول السباق والإبل والمواشي — بنفس هوية إعلانات تطمن.",
              "Professional formulas for race horses, camels, and livestock — designed in Tatman’s brand language.",
            )}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to="/shop"
              className="rounded-full bg-crimson px-7 py-3 text-sm font-bold text-white shadow-lg shadow-crimson/30 transition hover:brightness-110"
            >
              {t("تسوق الآن", "Shop now")}
            </Link>
            <Link
              to="/contact"
              className="rounded-full border border-white/40 bg-white/15 px-7 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
            >
              {t("اطلب عبر واتساب", "Order on WhatsApp")}
            </Link>
          </motion.div>
        </div>
      </section>

      <BenefitBar />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <p className="font-display text-sm tracking-[0.25em] text-medical">
            {t("المجموعة", "COLLECTION")}
          </p>
          <h2 className="mt-2 font-arabic text-3xl font-extrabold text-ink sm:text-4xl">
            {t("منتجات مختارة من خط تطمن", "Selected products from the Tatman line")}
          </h2>
          <p className="mt-3 text-ink/65">
            {t(
              "من محاليل الأداء إلى مكملات الخصوبة والمفاصل — مع جداول تركيبة واضحة.",
              "From performance liquids to fertility and joint supplements — with clear composition tables.",
            )}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/shop"
            className="inline-flex rounded-full border border-navy/20 bg-white px-6 py-3 text-sm font-bold text-navy transition hover:border-medical hover:text-medical"
          >
            {t("عرض كل المنتجات", "View all products")}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="overflow-hidden rounded-[2rem] bg-navy text-white shadow-[0_24px_60px_rgba(20,33,61,0.25)]">
          <div className="grid md:grid-cols-2">
            <div className="space-y-4 p-8 sm:p-12">
              <p className="font-display text-sm tracking-[0.25em] text-sand">TRUST · تطمن</p>
              <h2 className="font-arabic text-3xl font-extrabold">
                {t("نفس لغة الإعلان… بواجهة متجر جاهزة للبيع", "The flyer language — as a storefront ready to sell")}
              </h2>
              <p className="text-white/70 leading-relaxed">
                {t(
                  "هوية ثنائية اللغة، أيقونات الفوائد، جداول التركيبة، وطلب مباشر عبر واتساب الصيدلية.",
                  "Bilingual identity, benefit icons, composition tables, and direct WhatsApp pharmacy ordering.",
                )}
              </p>
            </div>
            <div className="relative min-h-56 bg-gradient-to-br from-steel to-track p-8">
              <div className="absolute inset-0 opacity-40 dune-pattern" />
              <div className="relative flex h-full items-center justify-center">
                <p className="font-arabic text-5xl font-extrabold text-sand/90">الصيدلية</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HorseSilhouette({ className }) {
  return (
    <svg viewBox="0 0 200 120" className={className} fill="currentColor">
      <path d="M20 100c10-40 40-70 80-80 10 20 25 35 45 40-10 25-30 45-55 55H50c-15-5-25-10-30-15zm110-55c20 5 40 20 50 40-25 5-45 20-55 40-5-30-15-55-25-70 10-5 20-8 30-10z" />
    </svg>
  );
}

function CamelSilhouette({ className }) {
  return (
    <svg viewBox="0 0 220 130" className={className} fill="currentColor">
      <path d="M10 105c15-35 40-55 75-60 15 15 25 35 30 55 20-25 40-40 70-45 5 30 0 50-15 60H40c-15-5-25-5-30-10zm95-50c5-20 20-35 40-40 5 15 5 30 0 45-15-5-30-5-40-5z" />
    </svg>
  );
}
