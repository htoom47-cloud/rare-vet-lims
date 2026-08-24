import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { formatPrice } from "../data/products";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { AnimalIcon } from "./Icons";
import { ProductVisual } from "./ProductVisual";

export function ProductCard({ product, index = 0 }) {
  const { t, lang } = useLang();
  const cart = useCart();

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="group relative overflow-hidden rounded-[1.5rem] bg-white/80 shadow-[0_12px_40px_rgba(20,33,61,0.08)] ring-1 ring-navy/5 backdrop-blur-sm"
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
            {product.animals.slice(0, 4).map((a) => (
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
        <div className="font-display text-lg text-crimson">{formatPrice(product.priceQar, lang)}</div>
        <button
          type="button"
          onClick={() => cart.add(product)}
          className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-medical"
        >
          {t("أضف للسلة", "Add to cart")}
        </button>
      </div>
    </motion.article>
  );
}
