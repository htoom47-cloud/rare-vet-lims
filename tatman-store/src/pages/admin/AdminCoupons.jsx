import { useEffect, useState } from "react";
import { api } from "../../api";
import { countryLabel } from "../../data/countries";

const empty = {
  code: "",
  type: "percent",
  value: 10,
  active: true,
  countries: ["qa", "sa"],
  minSubtotal: "",
  maxUses: "",
  expiresAt: "",
  note: "",
};

export function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [countries, setCountries] = useState([
    { code: "qa", nameAr: "قطر" },
    { code: "sa", nameAr: "السعودية" },
  ]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    const d = await api.coupons();
    setCoupons(d.coupons || []);
    if (d.countries?.length) setCountries(d.countries);
  }

  useEffect(() => {
    load().catch(() => setCoupons([]));
  }, []);

  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved("");
  }

  function toggleCountry(code) {
    setForm((f) => {
      const has = f.countries.includes(code);
      const countries = has ? f.countries.filter((c) => c !== code) : [...f.countries, code];
      return { ...f, countries: countries.length ? countries : [code] };
    });
    setSaved("");
  }

  function startEdit(c) {
    setEditId(c.id);
    setForm({
      code: c.code || "",
      type: c.type === "amount" ? "amount" : "percent",
      value: c.value ?? 0,
      active: c.active !== false,
      countries: c.countries?.length ? c.countries : ["qa", "sa"],
      minSubtotal: c.minSubtotal || "",
      maxUses: c.maxUses ?? "",
      expiresAt: (c.expiresAt || "").slice(0, 10),
      note: c.note || "",
    });
    setError("");
    setSaved("");
  }

  function resetForm() {
    setEditId(null);
    setForm(empty);
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const body = {
        ...form,
        value: Number(form.value) || 0,
        minSubtotal: form.minSubtotal === "" ? 0 : Number(form.minSubtotal),
        maxUses: form.maxUses === "" ? null : Number(form.maxUses),
        expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59.000Z` : "",
      };
      const data = await api.saveCoupon(editId, body);
      if (!data.coupon?.id) throw new Error("save_failed");
      await load();
      resetForm();
      setSaved("تم حفظ كود الخصم.");
    } catch (err) {
      if (err?.status === 409 || err?.message === "code_exists") setError("هذا الكود موجود مسبقاً.");
      else if (err?.message === "code_required") setError("أدخل رمز الكود.");
      else setError("تعذر الحفظ. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm("حذف كود الخصم؟")) return;
    await api.deleteCoupon(id);
    if (editId === id) resetForm();
    await load();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h1 className="text-3xl font-extrabold">أكواد الخصم</h1>
        <p className="mt-2 text-sm text-black/55">أضف كوداً ليستخدمه العميل في صفحة الدفع.</p>
        <div className="mt-6 space-y-3">
          {coupons.map((c) => (
            <article key={c.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="font-mono tracking-wide" dir="ltr">
                  {c.code}
                </strong>
                <span className="text-sm font-bold text-navy">
                  {c.type === "amount" ? `${c.value} خصم ثابت` : `${c.value}%`}
                </span>
              </div>
              <p className="mt-2 text-xs text-black/55">
                {c.active === false ? "متوقف" : "مفعّل"} ·{" "}
                {(c.countries || []).map((code) => countryLabel(code)).join(" / ")}
                {c.maxUses != null ? ` · الاستخدام: ${c.usedCount || 0}/${c.maxUses}` : ` · استخدم ${c.usedCount || 0} مرة`}
              </p>
              <div className="mt-3 flex gap-3 text-sm">
                <button type="button" className="font-bold text-medical" onClick={() => startEdit(c)}>
                  تعديل
                </button>
                <button type="button" className="font-bold text-crimson" onClick={() => remove(c.id)}>
                  حذف
                </button>
              </div>
            </article>
          ))}
          {!coupons.length && <p className="text-black/50">لا توجد أكواد بعد.</p>}
        </div>
      </section>

      <form onSubmit={save} className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">{editId ? "تعديل كود" : "كود جديد"}</h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">رمز الكود</span>
          <input className="input" dir="ltr" required value={form.code} onChange={(e) => patch("code", e.target.value)} placeholder="TATMAN10" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">نوع الخصم</span>
          <select className="input" value={form.type} onChange={(e) => patch("type", e.target.value)}>
            <option value="percent">نسبة مئوية %</option>
            <option value="amount">مبلغ ثابت</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">{form.type === "amount" ? "قيمة الخصم" : "نسبة الخصم"}</span>
          <input className="input" type="number" min="0" max={form.type === "percent" ? 100 : undefined} required value={form.value} onChange={(e) => patch("value", e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">حد أدنى للطلب (اختياري)</span>
          <input className="input" type="number" min="0" value={form.minSubtotal} onChange={(e) => patch("minSubtotal", e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">عدد مرات الاستخدام (اختياري)</span>
          <input className="input" type="number" min="0" value={form.maxUses} onChange={(e) => patch("maxUses", e.target.value)} placeholder="غير محدود" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">تاريخ الانتهاء (اختياري)</span>
          <input className="input" type="date" value={form.expiresAt} onChange={(e) => patch("expiresAt", e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          {countries.map((c) => (
            <label key={c.code} className="flex items-center gap-2">
              <input type="checkbox" checked={form.countries.includes(c.code)} onChange={() => toggleCountry(c.code)} />
              {c.nameAr}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} />
          مفعّل
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-navy">ملاحظة داخلية</span>
          <input className="input" value={form.note} onChange={(e) => patch("note", e.target.value)} />
        </label>
        {error && <p className="text-sm font-bold text-crimson">{error}</p>}
        {saved && <p className="text-sm font-bold text-medical">{saved}</p>}
        <div className="flex gap-3">
          <button disabled={busy} className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "جاري الحفظ..." : "حفظ"}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="rounded-full bg-mist px-5 py-2.5 text-sm font-bold text-navy">
              إلغاء
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
