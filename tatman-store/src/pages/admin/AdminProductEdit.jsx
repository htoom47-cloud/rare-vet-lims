import { useEffect, useState, Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { categories } from "../../data/products";
import { productImages } from "../../data/stock";

const empty = {
  nameAr: "",
  nameEn: "",
  slug: "",
  category: "performance",
  volume: "",
  formAr: "",
  formEn: "",
  taglineAr: "",
  taglineEn: "",
  priceQar: "",
  priceSar: "",
  stockQa: "",
  stockSa: "",
  packStyle: "box",
  availableQa: true,
  availableSa: true,
  active: true,
  animals: "camel,horse",
  benefitsAr: "",
  benefitsEn: "",
  image: "",
  images: [],
  prices: {},
  available: {},
  stock: {},
};

export function AdminProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [extraCountries, setExtraCountries] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .products()
      .then((d) => {
        setExtraCountries((d.countries || []).filter((c) => c.code !== "qa" && c.code !== "sa"));
      })
      .catch(() => setExtraCountries([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    api.products().then((d) => {
      const p = (d.products || []).find((x) => x.id === id);
      if (!p) return;
      setForm({
        ...empty,
        ...p,
        animals: (p.animals || []).join(","),
        benefitsAr: (p.benefitsAr || []).join("\n"),
        benefitsEn: (p.benefitsEn || []).join("\n"),
        stockQa: p.stockQa ?? "",
        stockSa: p.stockSa ?? "",
        images: productImages(p),
        image: productImages(p)[0] || "",
        prices: p.prices || {},
        available: p.available || {},
        stock: Object.fromEntries(Object.entries(p.stock || {}).map(([k, v]) => [k, v ?? ""])),
      });
    });
  }, [id, isNew]);

  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved("");
  }

  const images = productImages(form);

  async function onPickImages(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const data = await api.uploadImage(file);
        if (data.url) uploaded.push(data.url);
      }
      setForm((f) => {
        const next = [...productImages(f), ...uploaded].slice(0, 8);
        return { ...f, images: next, image: next[0] || "" };
      });
      setSaved("");
    } catch {
      setError("تعذر رفع الصورة. استخدم JPG أو PNG أو WEBP بحجم حتى 6MB.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url) {
    setForm((f) => {
      const next = productImages(f).filter((u) => u !== url);
      return { ...f, images: next, image: next[0] || "" };
    });
    setSaved("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const body = {
        ...form,
        priceQar: Number(form.priceQar) || 0,
        priceSar: Number(form.priceSar) || 0,
        stockQa: form.stockQa === "" ? null : Number(form.stockQa),
        stockSa: form.stockSa === "" ? null : Number(form.stockSa),
        prices: Object.fromEntries(
          extraCountries.map(({ code }) => [code, Number(form.prices?.[code]) || 0]),
        ),
        available: Object.fromEntries(
          extraCountries.map(({ code }) => [code, form.available?.[code] !== false]),
        ),
        stock: Object.fromEntries(
          extraCountries.map(({ code }) => [code, form.stock?.[code] === "" || form.stock?.[code] == null ? null : Number(form.stock[code])]),
        ),
        images,
        image: images[0] || "",
        animals: String(form.animals)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        benefitsAr: String(form.benefitsAr).split("\n").filter(Boolean),
        benefitsEn: String(form.benefitsEn).split("\n").filter(Boolean),
      };
      const data = await api.saveProduct(isNew ? null : id, body);
      const savedId = data.product?.id;
      if (!savedId) throw new Error("save_failed");
      const d = await api.products();
      const p = (d.products || []).find((x) => x.id === savedId);
      if (p) {
        setForm({
          ...empty,
          ...p,
          animals: (p.animals || []).join(","),
          benefitsAr: (p.benefitsAr || []).join("\n"),
          benefitsEn: (p.benefitsEn || []).join("\n"),
          stockQa: p.stockQa ?? "",
          stockSa: p.stockSa ?? "",
          images: productImages(p),
          image: productImages(p)[0] || "",
          prices: p.prices || {},
          available: p.available || {},
          stock: Object.fromEntries(Object.entries(p.stock || {}).map(([k, v]) => [k, v ?? ""])),
        });
      }
      setSaved("تم الحفظ في المتجر.");
      if (isNew) navigate(`/admin/products/${savedId}`, { replace: true });
    } catch {
      setError("تعذر الحفظ. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew) return;
    if (!confirm("حذف المنتج؟")) return;
    await api.deleteProduct(id);
    navigate("/admin/products");
  }

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-extrabold">{isNew ? "منتج جديد" : "تعديل منتج"}</h1>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">صور المنتج</h2>
        <p className="text-xs text-black/50">ارفع حتى 8 صور. الصورة الأولى تظهر في المتجر.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((url) => (
            <div key={url} className="relative overflow-hidden rounded-xl bg-mist ring-1 ring-navy/10">
              <img src={url} alt="" className="h-28 w-full object-contain bg-white" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute start-2 top-2 rounded-full bg-crimson px-2 py-0.5 text-[11px] font-bold text-white"
              >
                حذف
              </button>
            </div>
          ))}
          {images.length < 8 && (
            <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-navy/25 bg-mist/60 text-sm font-bold text-navy">
              {uploading ? "جاري الرفع..." : "إضافة صورة"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={onPickImages} disabled={uploading} />
            </label>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">بيانات المنتج</h2>
        <Field label="اسم المنتج بالعربية">
          <input className="input" value={form.nameAr} onChange={(e) => patch("nameAr", e.target.value)} required />
        </Field>
        <Field label="اسم المنتج بالإنجليزية">
          <input className="input" dir="ltr" value={form.nameEn} onChange={(e) => patch("nameEn", e.target.value)} />
        </Field>
        <Field label="رابط المنتج (slug)" hint="يظهر في عنوان الصفحة، مثال: vitavet-speed">
          <input className="input" dir="ltr" value={form.slug} onChange={(e) => patch("slug", e.target.value)} />
        </Field>
        <Field label="التصنيف">
          <select className="input" value={form.category} onChange={(e) => patch("category", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ar}
              </option>
            ))}
          </select>
        </Field>
        <Field label="حجم العبوة / الكمية" hint="مثال: 1 L أو 100 ml أو 20 فيال">
          <input className="input" value={form.volume} onChange={(e) => patch("volume", e.target.value)} />
        </Field>
        <Field label="شكل المستحضر بالعربية" hint="مثال: محلول فموي">
          <input className="input" value={form.formAr} onChange={(e) => patch("formAr", e.target.value)} />
        </Field>
        <Field label="شكل المستحضر بالإنجليزية">
          <input className="input" dir="ltr" value={form.formEn} onChange={(e) => patch("formEn", e.target.value)} />
        </Field>
        <Field label="شكل العرض إذا لم تُرفع صورة">
          <select className="input" value={form.packStyle} onChange={(e) => patch("packStyle", e.target.value)}>
            <option value="box">علبة</option>
            <option value="bottle">زجاجة</option>
            <option value="bucket">دلو</option>
            <option value="vial">فيال</option>
          </select>
        </Field>
        <Field label="الحيوانات المستهدفة" hint="مفصولة بفاصلة: camel, horse, goat">
          <input className="input" dir="ltr" value={form.animals} onChange={(e) => patch("animals", e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">الأسعار والعدد المتاح</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="سعر قطر (ر.ق)">
            <input className="input" type="number" min="0" step="1" value={form.priceQar} onChange={(e) => patch("priceQar", e.target.value)} />
          </Field>
          <Field label="سعر السعودية (ر.س)">
            <input className="input" type="number" min="0" step="1" value={form.priceSar} onChange={(e) => patch("priceSar", e.target.value)} />
          </Field>
          <Field label="العدد المتاح في قطر" hint="اتركه فارغاً إذا لا تريد تتبع المخزون. 0 = غير متوفر">
            <input className="input" type="number" min="0" step="1" value={form.stockQa} onChange={(e) => patch("stockQa", e.target.value)} />
          </Field>
          <Field label="العدد المتاح في السعودية" hint="اتركه فارغاً إذا لا تريد تتبع المخزون. 0 = غير متوفر">
            <input className="input" type="number" min="0" step="1" value={form.stockSa} onChange={(e) => patch("stockSa", e.target.value)} />
          </Field>
          {extraCountries.map(({ code, nameAr, currencyAr }) => (
            <Fragment key={code}>
              <Field label={`سعر ${nameAr} (${currencyAr || code})`}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.prices?.[code] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, prices: { ...f.prices, [code]: e.target.value } }))}
                />
              </Field>
              <Field label={`العدد المتاح في ${nameAr}`} hint="اتركه فارغاً إذا لا تريد تتبع المخزون. 0 = غير متوفر">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock?.[code] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, stock: { ...f.stock, [code]: e.target.value } }))}
                />
              </Field>
            </Fragment>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">الوصف والفوائد</h2>
        <Field label="وصف قصير بالعربية">
          <textarea className="input min-h-20" value={form.taglineAr} onChange={(e) => patch("taglineAr", e.target.value)} />
        </Field>
        <Field label="وصف قصير بالإنجليزية">
          <textarea className="input min-h-20" dir="ltr" value={form.taglineEn} onChange={(e) => patch("taglineEn", e.target.value)} />
        </Field>
        <Field label="الفوائد بالعربية" hint="سطر لكل نقطة">
          <textarea className="input min-h-24" value={form.benefitsAr} onChange={(e) => patch("benefitsAr", e.target.value)} />
        </Field>
        <Field label="الفوائد بالإنجليزية" hint="سطر لكل نقطة">
          <textarea className="input min-h-24" dir="ltr" value={form.benefitsEn} onChange={(e) => patch("benefitsEn", e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">الظهور في المتجر</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.availableQa} onChange={(e) => patch("availableQa", e.target.checked)} /> متاح في قطر
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.availableSa} onChange={(e) => patch("availableSa", e.target.checked)} /> متاح في السعودية
        </label>
        {extraCountries.map(({ code, nameAr }) => (
          <label key={code} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.available?.[code] !== false}
              onChange={(e) => setForm((f) => ({ ...f, available: { ...f.available, [code]: e.target.checked } }))}
            />{" "}
            متاح في {nameAr}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} /> ظاهر في المتجر
        </label>
      </section>

      {error && <p className="text-sm font-bold text-crimson">{error}</p>}
      {saved && <p className="text-sm font-bold text-medical">{saved}</p>}

      <div className="flex gap-3 pt-2">
        <button disabled={busy || uploading} className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {busy ? "جاري الحفظ..." : "حفظ"}
        </button>
        {!isNew && (
          <button type="button" onClick={remove} className="rounded-full bg-crimson px-5 py-2.5 text-sm font-bold text-white">
            حذف
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-bold text-navy">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-black/50">{hint}</span> : null}
    </label>
  );
}
