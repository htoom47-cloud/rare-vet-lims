import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { categories } from "../data/products";
import { useLang } from "../context/LangContext";
import { useCatalog } from "../context/CatalogContext";
import { ProductCard } from "../components/ProductCard";

export function Shop() {
  const { t } = useLang();
  const { products } = useCatalog();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "all";

  const filtered = useMemo(() => {
    if (cat === "all") return products;
    return products.filter((p) => p.category === cat);
  }, [cat, products]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="shop-hero">
        <picture>
          <source media="(max-width: 768px)" srcSet="/brand/hero-mobile.jpg" />
          <img src="/brand/hero-desktop.jpg" alt="" className="shop-hero-photo" />
        </picture>
        <div className="shop-hero-scrim" />
        <img src="/brand/logo.png?v=pdf-original" alt="" className="shop-hero-logo" />
        <div className="relative z-10 max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
          <p className="font-display text-sm tracking-[0.25em] text-medical">
            {t("المتجر", "SHOP")}
          </p>
          <h1 className="mt-2 font-arabic text-4xl font-extrabold text-ink">
            {t("منتجات تطمن البيطرية", "Tatman veterinary products")}
          </h1>
          <p className="mt-3 text-ink/70">
            {t(
              "اختر حسب الفائدة أو استعرض المجموعة كاملة.",
              "Filter by benefit or browse the full collection.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <FilterChip
          active={cat === "all"}
          onClick={() => setParams({})}
          label={t("الكل", "All")}
        />
        {categories.map((c) => (
          <FilterChip
            key={c.id}
            active={cat === c.id}
            onClick={() => setParams({ cat: c.id })}
            label={t(c.ar, c.en)}
          />
        ))}
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>

      {!filtered.length && (
        <p className="mt-16 text-center text-ink/55">
          {t("لا توجد منتجات في هذا التصنيف حالياً.", "No products in this category yet.")}
        </p>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-navy text-white"
          : "bg-white text-navy ring-1 ring-navy/10 hover:ring-medical"
      }`}
    >
      {label}
    </button>
  );
}
