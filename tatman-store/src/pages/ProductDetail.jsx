import { Link, useParams } from "react-router-dom";
import { formatPrice, getProduct } from "../data/products";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { AnimalIcon } from "../components/Icons";
import { ProductVisual } from "../components/ProductVisual";

export function ProductDetail() {
  const { slug } = useParams();
  const product = getProduct(slug);
  const { t, lang } = useLang();
  const cart = useCart();

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-arabic text-3xl font-extrabold">
          {t("المنتج غير موجود", "Product not found")}
        </h1>
        <Link to="/shop" className="mt-6 inline-block text-medical underline">
          {t("العودة للمتجر", "Back to shop")}
        </Link>
      </div>
    );
  }

  const benefits = lang === "ar" ? product.benefitsAr : product.benefitsEn;
  const dosage = lang === "ar" ? product.dosageAr : product.dosageEn;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link to="/shop" className="text-sm font-semibold text-medical">
        ← {t("العودة للمنتجات", "Back to products")}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-white/80 p-6 shadow-lg ring-1 ring-navy/5">
          <ProductVisual product={product} className="min-h-72" />
        </div>

        <div>
          <p className="text-sm font-semibold text-medical">
            {product.volume} · {t(product.formAr, product.formEn)}
          </p>
          <h1 className="mt-2 font-arabic text-4xl font-extrabold text-ink">{product.nameAr}</h1>
          <p className="mt-1 font-display text-2xl tracking-[0.12em] text-navy">{product.nameEn}</p>
          <p className="mt-4 text-ink/70 leading-relaxed">
            {t(product.taglineAr, product.taglineEn)}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {product.animals.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-xs font-semibold capitalize text-navy"
              >
                <AnimalIcon type={a} />
                {a}
              </span>
            ))}
          </div>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center"
            >
            <div className="font-display text-3xl text-crimson">
              {formatPrice(product.priceQar, lang)}
            </div>
            <button
              type="button"
              onClick={() => cart.add(product)}
              className="min-h-12 rounded-full bg-crimson px-6 py-3 text-sm font-bold text-white shadow-lg shadow-crimson/25"
            >
              {t("أضف إلى السلة", "Add to cart")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-navy/5">
          <h2 className="font-display text-sm tracking-[0.2em] text-medical">
            {t("الفوائد", "BENEFITS")}
          </h2>
          <ul className="mt-4 space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex gap-3 text-sm leading-relaxed text-ink/80">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-crimson" />
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-navy p-6 text-white shadow-sm">
          <h2 className="font-display text-sm tracking-[0.2em] text-sand">
            {t("الجرعة / الاستخدام", "DOSAGE / USE")}
          </h2>
          <div className="mt-4 space-y-3">
            {dosage.map((d) => (
              <div
                key={d.label}
                className="flex items-center justify-between gap-4 rounded-xl bg-white/10 px-4 py-3"
              >
                <span className="font-semibold">{d.label}</span>
                <span className="text-sand">{d.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/60">
            {t(
              "تنبيه: يُستخدم تحت إشراف طبيب بيطري. للحيوانات فقط.",
              "Caution: Use under veterinary supervision. For animals only.",
            )}
          </p>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-navy/5">
        <div className="bg-gradient-to-l from-medical to-navy px-6 py-3">
          <h2 className="font-display text-sm tracking-[0.22em] text-white">
            {product.nameEn} — COMPOSITION
          </h2>
        </div>
        <table className="spec-table w-full text-sm">
          <tbody>
            {product.composition.map((row) => (
              <tr key={row.name} className="border-b border-navy/5">
                <td className="px-6 py-3 font-semibold text-navy">{row.name}</td>
                <td className="px-6 py-3 text-end text-ink/70">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
