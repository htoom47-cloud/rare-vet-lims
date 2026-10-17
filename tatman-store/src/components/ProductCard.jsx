import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { useCountry } from "../context/CountryContext";
import { AnimalIcon } from "./Icons";
import { ProductVisual } from "./ProductVisual";
import { stockOf } from "../data/stock";

export function ProductCard({ product, index = 0 }) {
  const { t, lang } = useLang();
  const cart = useCart();
  const { priceOf, formatPrice, country } = useCountry();
  const stock = stockOf(product, country);
  const soldOut = stock === 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="group relative overflow-hidden rounded-[1.35rem] bg-white/90 shadow-[0_12px_40px_rgba(58,44,31,0.08)] ring-1 ring-track/10 backdrop-blur-sm sm:rounded-[1.5rem]"
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: `linear-gradient(90deg, ${product.secondary}, ${product.accent})` }}
      />
      <Link to={`/product/${product.slug}`} className="block pt-6">
        <ProductVisual product={product} />
        <div className="space-y-2 px-5 pb-2">
          <p className="text-xs font-semibold tracking-wide text-medical/80">
            {product.volume} · {t(product.formAr, product.formEn)}
          </p>
          <h3 className="font-arabic text-xl font-extrabold text-ink">{product.nameAr}</h3>
          <p className="font-display text-sm tracking-[0.12em] text-navy">{product.nameEn}</p>
          <p className="line-clamp-2 text-sm leading-relaxed text-ink/65">
            {t(product.taglineAr, product.taglineEn)}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {(product.animals || []).slice(0, 4).map((a) => (
              <span
                key={a}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mist text-navy"
                title={a}
              >
                <AnimalIcon type={a} className="h-4 w-4" />
              </span>
            ))}
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-navy/5 px-5 py-4">
        <div>
          <div className="font-display text-lg text-crimson">{formatPrice(priceOf(product), lang)}</div>
          {stock !== null && (
            <div className={`text-xs font-semibold ${soldOut ? "text-crimson" : "text-ink/55"}`}>
              {soldOut ? t("غير متوفر", "Out of stock") : t(`المتوفر: ${stock}`, `${stock} available`)}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={soldOut}
          onClick={() => cart.add(product)}
          className="min-h-10 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white transition hover:bg-medical disabled:cursor-not-allowed disabled:bg-ink/25"
        >
          {soldOut ? t("غير متوفر", "Unavailable") : t("أضف للسلة", "Add to cart")}
        </button>
      </div>
    </motion.article>
  );
}
