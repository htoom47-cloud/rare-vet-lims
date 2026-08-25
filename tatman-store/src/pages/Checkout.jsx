import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { useCountry } from "../context/CountryContext";
import { useCatalog } from "../context/CatalogContext";
import { api } from "../api";
import { checkoutMethods } from "../data/payments";
import { ApplePayMark } from "../components/ApplePayMark";

function couponMessage(code, t) {
  if (code === "coupon_country") return t("هذا الكود غير متاح لهذه الدولة.", "This code is not available for this country.");
  if (code === "coupon_expired") return t("انتهت صلاحية كود الخصم.", "This discount code has expired.");
  if (code === "coupon_used_up") return t("استُنفد هذا الكود.", "This code has been fully used.");
  if (code === "coupon_min") return t("الطلب أقل من الحد الأدنى لهذا الكود.", "The order is below this code’s minimum.");
  if (code === "coupon_invalid" || code === "coupon_inactive") {
    return t("كود الخصم غير صالح.", "Invalid discount code.");
  }
  return t("تعذر تطبيق كود الخصم.", "Could not apply the discount code.");
}

export function Checkout() {
  const { t, lang } = useLang();
  const cart = useCart();
  const { country, formatPrice } = useCountry();
  const { settings } = useCatalog();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", phone: "", city: "", address: "", notes: "" });
  const [method, setMethod] = useState("whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  const payments = settings?.payments || { whatsapp: true, bank: true, cod: true, applePay: true };
  const methods = checkoutMethods(payments);
  const selectedMethod = methods.some((m) => m.id === method) ? method : methods[0]?.id || "whatsapp";
  const couponOk = applied && applied.country === country && applied.subtotal === cart.total ? applied : null;
  const payable = couponOk ? couponOk.total : cart.total;

  async function applyCoupon() {
    setCouponError("");
    setCouponBusy(true);
    try {
      const data = await api.previewCoupon({
        code: couponInput,
        country,
        subtotal: cart.total,
      });
      setApplied({ ...data, country, subtotal: cart.total });
    } catch (err) {
      setApplied(null);
      setCouponError(couponMessage(err?.message, t));
    } finally {
      setCouponBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.createOrder({
        country,
        paymentMethod: selectedMethod,
        notes: form.notes,
        couponCode: couponOk?.code || "",
        customer: form,
        items: cart.items.map((i) => ({ id: i.product.id, qty: i.qty })),
      });
      cart.clear();
      setDone(result);
      if (method === "whatsapp" && result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank");
      }
    } catch (err) {
      if (err?.status === 409) {
        setError(t("الكمية المطلوبة غير متاحة حالياً.", "Requested quantity is not available."));
      } else if (String(err?.message || "").startsWith("coupon_")) {
        setApplied(null);
        setError(couponMessage(err.message, t));
      } else {
        setError(t("تعذر إرسال الطلب. تأكد من البيانات وحاول مرة أخرى.", "Could not place order. Check details and try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!cart.items.length && !done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-ink/60">{t("سلتك فارغة.", "Your cart is empty.")}</p>
        <Link to="/shop" className="mt-4 inline-block font-bold text-medical">
          {t("العودة للمتجر", "Back to shop")}
        </Link>
      </div>
    );
  }

  if (done) {
    const apple = done.order?.paymentMethod === "applePay";
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-arabic text-3xl font-extrabold">
          {apple ? t("تم تسجيل الطلب — أبل باي", "Order placed — Apple Pay") : t("تم تسجيل الطلب", "Order placed")}
        </h1>
        <p className="mt-2 text-ink/70">
          {t("رقم الطلب", "Order no.")}: <strong>{done.order.id}</strong>
        </p>
        {done.order?.discount ? (
          <p className="mt-2 text-sm text-ink/70">
            {t("الخصم", "Discount")} ({done.order.couponCode}): −{formatPrice(done.order.discount, lang)}
            {" · "}
            {t("الإجمالي", "Total")}: {formatPrice(done.order.total, lang)}
          </p>
        ) : null}
        {apple && (
          <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-relaxed text-ink/75 ring-1 ring-navy/10">
            {t(
              "طلبك بانتظار إتمام الدفع عبر Apple Pay. تابع عبر واتساب لتأكيد العملية، أو ادفع من iPhone / Safari.",
              "Your order is awaiting Apple Pay. Continue on WhatsApp to confirm, or pay from iPhone / Safari.",
            )}
          </p>
        )}
        {done.bank?.iban && (
          <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
            <p className="font-bold">{t("بيانات التحويل", "Bank details")}</p>
            <p className="mt-2 text-sm">{done.bank.accountName}</p>
            <p className="text-sm">{done.bank.bankName}</p>
            <p className="mt-1 font-mono text-sm" dir="ltr">
              {done.bank.iban}
            </p>
          </div>
        )}
        {done.whatsappUrl && (
          <a
            href={done.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-ink"
          >
            {t("متابعة على واتساب", "Continue on WhatsApp")}
          </a>
        )}
        <button type="button" className="mt-6 block text-sm font-bold text-navy" onClick={() => navigate("/shop")}>
          {t("متابعة التسوق", "Continue shopping")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-arabic text-3xl font-extrabold">{t("إتمام الطلب", "Checkout")}</h1>
      <p className="mt-2 text-sm text-ink/60">
        {t("المتجر:", "Store:")} {country === "sa" ? t("السعودية", "Saudi Arabia") : t("قطر", "Qatar")}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <input required className="input" placeholder={t("الاسم", "Name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required className="input" placeholder={t("رقم الجوال", "Mobile")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="input" placeholder={t("المدينة", "City")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <textarea className="input min-h-24" placeholder={t("العنوان", "Address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

        <div className="space-y-2">
          <p className="text-sm font-bold">{t("طريقة الدفع", "Payment method")}</p>
          {methods.map((m) => {
            const selected = selectedMethod === m.id;
            const apple = m.id === "applePay";
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 transition ${
                  apple && selected
                    ? "bg-black text-white ring-black"
                    : selected
                      ? "bg-mist ring-navy/20"
                      : "bg-white ring-navy/10"
                }`}
              >
                <input type="radio" name="pay" checked={selected} onChange={() => setMethod(m.id)} />
                {apple ? <ApplePayMark light={selected} /> : <span>{t(m.ar, m.en)}</span>}
              </label>
            );
          })}
        </div>

        <textarea className="input min-h-20" placeholder={t("ملاحظات", "Notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

        <div className="rounded-2xl bg-white p-4 ring-1 ring-navy/10">
          <p className="text-sm font-bold">{t("كود الخصم", "Discount code")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="input flex-1"
              dir="ltr"
              value={couponInput}
              onChange={(e) => {
                setCouponInput(e.target.value);
                setCouponError("");
                if (applied) setApplied(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (couponInput.trim() && !couponBusy) applyCoupon();
                }
              }}
              placeholder={t("أدخل الكود", "Enter code")}
              autoComplete="off"
            />
            <button
              type="button"
              disabled={couponBusy || !couponInput.trim()}
              onClick={applyCoupon}
              className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {couponBusy ? "..." : t("تطبيق", "Apply")}
            </button>
          </div>
          {couponOk ? (
            <p className="mt-2 text-sm font-bold text-medical">
              {t("تم تطبيق", "Applied")} {couponOk.code} (−{formatPrice(couponOk.discount, lang)})
            </p>
          ) : null}
          {couponError ? <p className="mt-2 text-sm text-crimson">{couponError}</p> : null}
        </div>

        <div className="space-y-2 rounded-2xl bg-navy p-4 text-white">
          <div className="flex items-center justify-between text-sm text-white/80">
            <span>{t("المجموع", "Subtotal")}</span>
            <span>{formatPrice(cart.total, lang)}</span>
          </div>
          {couponOk?.discount ? (
            <div className="flex items-center justify-between text-sm text-sand">
              <span>
                {t("الخصم", "Discount")} ({couponOk.code})
              </span>
              <span>−{formatPrice(couponOk.discount, lang)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span>{t("الإجمالي", "Total")}</span>
            <span className="font-display text-xl text-sand">{formatPrice(payable, lang)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-crimson">{error}</p>}
        <button
          disabled={busy}
          className={`min-h-12 w-full rounded-full text-sm font-extrabold ${
            selectedMethod === "applePay" ? "bg-black text-white" : "bg-crimson text-white"
          }`}
        >
          {busy ? "..." : selectedMethod === "applePay" ? t("الدفع عبر أبل باي", "Pay with Apple Pay") : t("تأكيد الطلب", "Confirm order")}
        </button>
      </form>
    </div>
  );
}
