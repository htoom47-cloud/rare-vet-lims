import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { findCourier, shapeCourier } from "../../data/couriers";

const TABS = [
  ["pricing", "تسعيرة الشحن"],
  ["display", "بيانات العرض"],
  ["extra", "معلومات إضافية"],
];

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-navy/60" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Suffixed({ suffix, children }) {
  return (
    <div className="flex items-center rounded-[0.9rem] border border-navy/10 bg-white">
      <div className="min-w-0 flex-1">{children}</div>
      <span className="shrink-0 px-3 text-xs font-bold text-navy/60">{suffix}</span>
    </div>
  );
}

export function AdminCourierEdit() {
  const { country, courierId } = useParams();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("pricing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    const d = await api.settings();
    setSettings(d.settings);
    const row = findCourier(d.settings?.[country]?.couriers, courierId);
    setForm(row ? shapeCourier(row) : null);
  }

  useEffect(() => {
    load().catch(() => {
      setSettings(null);
      setForm(null);
    });
  }, [country, courierId]);

  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved("");
  }

  async function persist(nextCourier, message) {
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const next = {
        ...settings,
        [country]: {
          ...settings[country],
          couriers: (settings[country].couriers || []).map((c) => (c.id === courierId ? nextCourier : c)),
        },
      };
      const d = await api.saveSettings(next);
      if (!d.settings) throw new Error("save_failed");
      setSettings(d.settings);
      const row = findCourier(d.settings?.[country]?.couriers, courierId);
      if (!row) throw new Error("save_failed");
      setForm(shapeCourier(row));
      setSaved(message);
    } catch {
      setError("تعذر الحفظ. حاول مرة أخرى.");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!form?.nameAr?.trim()) {
      setError("أدخل اسم الشركة.");
      return;
    }
    await persist(shapeCourier(form), "تم حفظ إعدادات الشركة.");
  }

  async function reset() {
    setError("");
    setSaved("");
    await load();
    setSaved("تمت إعادة التحميل من النظام.");
  }

  if (!settings) return <p>...</p>;
  if (!form) {
    return (
      <div>
        <p className="font-bold text-crimson">شركة التوصيل غير موجودة.</p>
        <Link to="/admin/shipping" className="mt-3 inline-block text-sm font-bold text-navy">
          العودة لشركات التوصيل
        </Link>
      </div>
    );
  }

  const currencyAr = settings[country]?.currencyAr || "";
  const countryName = settings[country]?.nameAr || country;

  return (
    <form onSubmit={save} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-navy/10">
      <div className="flex items-center justify-between bg-medical/15 px-4 py-3">
        <h1 className="text-lg font-extrabold text-navy">{form.nameAr || "شركة التوصيل"}</h1>
        <Link to="/admin/shipping" className="rounded-lg p-1 text-navy" aria-label="إغلاق">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </div>

      <div className="flex items-center gap-3 border-b border-navy/10 px-4 py-4">
        {form.logo ? (
          <img src={form.logo} alt="" className="h-12 w-12 rounded-xl bg-mist object-contain ring-1 ring-navy/10" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-mist text-lg font-extrabold text-navy">
            {(form.nameAr || "?").slice(0, 1)}
          </div>
        )}
        <div>
          <p className="font-extrabold text-navy">{form.nameAr}</p>
          <p className="text-xs text-black/50">{form.nameEn} · {countryName}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 bg-mist p-1 mx-4 mt-4 rounded-xl">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-2 py-2 text-xs font-extrabold sm:text-sm ${
              tab === id ? "bg-white text-navy shadow-sm" : "text-navy/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {tab === "pricing" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نوع الشحن">
                <div className="flex items-center gap-2 rounded-[0.9rem] border border-navy/10 bg-white px-3">
                  <Icon path="M3 7h13l5 5v5H3V7zm13 0v5h5" />
                  <select className="input border-0 px-0" value={form.shippingType} onChange={(e) => patch("shippingType", e.target.value)}>
                    <option value="shipping">الشحن</option>
                    <option value="pickup">استلام من المتجر</option>
                  </select>
                </div>
              </Field>
              <Field label="الحالة">
                <div className="flex items-center gap-2 rounded-[0.9rem] border border-navy/10 bg-white px-3">
                  <Icon path="M3 17h18M5 17V9l7-4 7 4v8" />
                  <select className="input border-0 px-0" value={form.active ? "on" : "off"} onChange={(e) => patch("active", e.target.value === "on")}>
                    <option value="on">مفعّلة</option>
                    <option value="off">متوقفة</option>
                  </select>
                </div>
              </Field>
              <Field label="نوع التسعيرة" required>
                <div className="flex items-center gap-2 rounded-[0.9rem] border border-navy/10 bg-white px-3">
                  <Icon path="M5 4h14v4H5V4zm2 8h10M7 16h6M9 20h6" />
                  <select className="input border-0 px-0" value={form.pricingType} onChange={(e) => patch("pricingType", e.target.value)}>
                    <option value="flat">سعر ثابت</option>
                    <option value="weight">حسب الوزن</option>
                  </select>
                </div>
              </Field>
              <Field label="تكلفة الشحن للتاجر" required>
                <Suffixed suffix={currencyAr}>
                  <input className="input border-0" type="number" min="0" step="0.01" value={form.merchantFee} onChange={(e) => patch("merchantFee", e.target.value)} />
                </Suffixed>
              </Field>
              <Field label="رسوم الشحن للعميل" required hint="هذا المبلغ يظهر في صفحة الدفع ويُضاف للطلب.">
                <Suffixed suffix={currencyAr}>
                  <input className="input border-0" type="number" min="0" step="0.01" value={form.fee} onChange={(e) => patch("fee", e.target.value)} />
                </Suffixed>
              </Field>
              {form.pricingType === "weight" && (
                <>
                  <Field label="وزن الشحن" required>
                    <Suffixed suffix="كجم">
                      <input className="input border-0" type="number" min="0" step="0.01" value={form.weightKg} onChange={(e) => patch("weightKg", e.target.value)} />
                    </Suffixed>
                  </Field>
                  <Field label="تكلفة الزيادة" required>
                    <Suffixed suffix={currencyAr}>
                      <input className="input border-0" type="number" min="0" step="0.01" value={form.extraCost} onChange={(e) => patch("extraCost", e.target.value)} />
                    </Suffixed>
                  </Field>
                  <Field label="لكل" required>
                    <Suffixed suffix="كجم">
                      <input className="input border-0" type="number" min="0" step="0.01" value={form.extraPerKg} onChange={(e) => patch("extraPerKg", e.target.value)} />
                    </Suffixed>
                  </Field>
                </>
              )}
            </div>

            {form.pricingType === "weight" ? (
              <div className="rounded-xl bg-[#e8f2fb] p-4 text-sm text-navy">
                <p className="font-extrabold">ملخص التسعيرة</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <span>لأول {form.weightKg || 0} كجم</span>
                  <span>تكلفة الشحن {form.fee || 0} {currencyAr}</span>
                  <span>لكل {form.extraPerKg || 1} كجم إضافي</span>
                  <span>تكلفة الزيادة {form.extraCost || 0} {currencyAr}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#e8f2fb] p-4 text-sm text-navy">
                <p className="font-extrabold">ملخص التسعيرة</p>
                <p className="mt-2">رسوم ثابتة للعميل: {form.fee || 0} {currencyAr}</p>
              </div>
            )}

            <Field label="مدة الشحن" required>
              <div className="flex items-center gap-2 rounded-[0.9rem] border border-navy/10 bg-white px-3">
                <Icon path="M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />
                <input className="input border-0 px-0" value={form.etaAr} placeholder="من 1 - 2 يوم عمل" onChange={(e) => patch("etaAr", e.target.value)} />
              </div>
            </Field>

            <div>
              <p className="mb-2 text-sm font-bold text-navy">خيارات إضافية</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.codEnabled !== false} onChange={(e) => patch("codEnabled", e.target.checked)} />
                تفعيل الدفع عند الاستلام
              </label>
            </div>
          </>
        )}

        {tab === "display" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم الشركة بالعربية" required>
              <input className="input" value={form.nameAr} onChange={(e) => patch("nameAr", e.target.value)} />
            </Field>
            <Field label="اسم الشركة بالإنجليزية">
              <input className="input" dir="ltr" value={form.nameEn} onChange={(e) => patch("nameEn", e.target.value)} />
            </Field>
            <Field label="وصف يظهر للعميل">
              <input className="input" value={form.descriptionAr} onChange={(e) => patch("descriptionAr", e.target.value)} />
            </Field>
            <Field label="الوصف بالإنجليزية">
              <input className="input" dir="ltr" value={form.descriptionEn} onChange={(e) => patch("descriptionEn", e.target.value)} />
            </Field>
            <Field label="رابط الشعار" hint="رابط صورة أو ملف مرفوع. اتركه فارغاً لإظهار الحرف الأول.">
              <input className="input" dir="ltr" value={form.logo} placeholder="https://..." onChange={(e) => patch("logo", e.target.value)} />
            </Field>
            <Field label="رابط التتبع" hint="استخدم {code} لرقم التتبع.">
              <input className="input" dir="ltr" value={form.trackUrl} placeholder="https://...{code}" onChange={(e) => patch("trackUrl", e.target.value)} />
            </Field>
          </div>
        )}

        {tab === "extra" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="هاتف الشركة">
              <input className="input" dir="ltr" value={form.phone} onChange={(e) => patch("phone", e.target.value)} />
            </Field>
            <Field label="مدة الشحن بالإنجليزية">
              <input className="input" dir="ltr" value={form.etaEn} placeholder="1–2 business days" onChange={(e) => patch("etaEn", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="ملاحظة داخلية">
                <textarea className="input min-h-24" value={form.note} onChange={(e) => patch("note", e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {error && <p className="text-sm font-bold text-crimson">{error}</p>}
        {saved && <p className="text-sm font-bold text-medical">{saved}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy/10 bg-mist/60 px-4 py-3">
        <button type="button" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-navy ring-1 ring-navy/10" onClick={() => navigate("/admin/shipping")}>
          خروج
        </button>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-navy ring-1 ring-navy/10 disabled:opacity-60" onClick={reset}>
            إعادة تعيين
          </button>
          <button disabled={busy} className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-bold text-navy">
        {label}
        {required ? <span className="ms-1 text-crimson">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-black/50">{hint}</span> : null}
    </label>
  );
}
