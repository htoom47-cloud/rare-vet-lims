import { Link } from "react-router-dom";
import { formatPrice } from "../data/products";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";

export function Cart() {
  const { t, lang } = useLang();
  const cart = useCart();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-arabic text-4xl font-extrabold text-ink">
        {t("سلة التسوق", "Shopping cart")}
      </h1>

      {!cart.items.length ? (
        <div className="mt-10 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-navy/5">
          <p className="text-ink/60">{t("سلتك فارغة.", "Your cart is empty.")}</p>
          <Link
            to="/shop"
            className="mt-6 inline-flex rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white"
          >
            {t("تصفح المنتجات", "Browse products")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {cart.items.map(({ product, qty }) => (
            <div
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy/5"
            >
              <div>
                <p className="font-arabic text-lg font-extrabold">{product.nameAr}</p>
                <p className="font-display text-xs tracking-wider text-navy">{product.nameEn}</p>
                <p className="mt-1 text-sm text-crimson">
                  {formatPrice(product.priceQar, lang)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="h-8 w-8 rounded-full bg-mist font-bold"
                  onClick={() => cart.setQty(product.id, qty - 1)}
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold">{qty}</span>
                <button
                  type="button"
                  className="h-8 w-8 rounded-full bg-mist font-bold"
                  onClick={() => cart.setQty(product.id, qty + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="ms-2 text-xs font-semibold text-crimson"
                  onClick={() => cart.remove(product.id)}
                >
                  {t("حذف", "Remove")}
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-2xl bg-navy p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="text-white/70">{t("الإجمالي", "Total")}</span>
              <span className="font-display text-2xl text-sand">
                {formatPrice(cart.total, lang)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => cart.whatsappCheckout(lang)}
              className="mt-5 w-full rounded-full bg-[#25D366] py-3 text-sm font-bold text-ink"
            >
              {t("إتمام الطلب عبر واتساب", "Checkout via WhatsApp")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
