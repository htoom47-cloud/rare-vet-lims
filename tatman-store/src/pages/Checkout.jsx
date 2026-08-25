import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { useCountry } from "../context/CountryContext";
import { useCatalog } from "../context/CatalogContext";
import { api } from "../api";

const METHODS = [
  { id: "whatsapp", ar: "واتساب", en: "WhatsApp", keys: ["whatsapp"] },
  { id: "bank", ar: "تحويل بنكي", en: "Bank transfer", keys: ["bank"] },
  { id: "cod", ar: "الدفع عند الاستلام", en: "Cash on delivery", keys: ["cod"] },
  { id: "card", ar: "بطاقة ائتمان / مدى", en: "Card / Mada", keys: ["card", "mada"] },
];

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

  const payments = settings?.payments || { whatsapp: true, bank: true, cod: true };
  const methods = METHODS.filter((m) => m.keys.some((k) => payments[k]));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.createOrder({
        country,
        paymentMethod: method,
        notes: form.notes,
        customer: form,
        items: cart.items.map((i) => ({ id: i.product.id, qty: i.qty })),
      });
      cart.clear();
      setDone(result);
      if (method === "whatsapp" && result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank");
      }
    } catch {
      setError(t("تعذر إرسال الطلب. تأكد من البيانات وحاول مرة أخرى.", "Could not place order. Check details and try again."));
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
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-arabic text-3xl font-extrabold">{t("تم تسجيل الطلب", "Order placed")}</h1>
        <p className="mt-2 text-ink/70">
          {t("رقم الطلب", "Order no.")}: <strong>{done.order.id}</strong>
        </p>
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
          {methods.map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-navy/10">
              <input type="radio" name="pay" checked={method === m.id} onChange={() => setMethod(m.id)} />
              <span>{t(m.ar, m.en)}</span>
            </label>
          ))}
        </div>

        <textarea className="input min-h-20" placeholder={t("ملاحظات", "Notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

        <div className="flex items-center justify-between rounded-2xl bg-navy p-4 text-white">
          <span>{t("الإجمالي", "Total")}</span>
          <span className="font-display text-xl text-sand">{formatPrice(cart.total, lang)}</span>
        </div>

        {error && <p className="text-sm text-crimson">{error}</p>}
        <button disabled={busy} className="min-h-12 w-full rounded-full bg-crimson text-sm font-extrabold text-white">
          {busy ? "..." : t("تأكيد الطلب", "Confirm order")}
        </button>
      </form>
    </div>
  );
}
