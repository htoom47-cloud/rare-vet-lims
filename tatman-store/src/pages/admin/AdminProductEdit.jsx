import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";

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
  priceQar: 0,
  priceSar: 0,
  packStyle: "box",
  availableQa: true,
  availableSa: true,
  active: true,
  animals: "camel,horse",
  benefitsAr: "",
  benefitsEn: "",
};

export function AdminProductEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const [form, setForm] = useState(empty);
  const navigate = useNavigate();

  useEffect(() => {
    if (isNew) return;
    api.products().then((d) => {
      const p = (d.products || []).find((x) => x.id === id);
      if (!p) return;
      setForm({
        ...p,
        animals: (p.animals || []).join(","),
        benefitsAr: (p.benefitsAr || []).join("\n"),
        benefitsEn: (p.benefitsEn || []).join("\n"),
      });
    });
  }, [id, isNew]);

  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    const body = {
      ...form,
      priceQar: Number(form.priceQar),
      priceSar: Number(form.priceSar),
      animals: String(form.animals)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      benefitsAr: String(form.benefitsAr).split("\n").filter(Boolean),
      benefitsEn: String(form.benefitsEn).split("\n").filter(Boolean),
    };
    await api.saveProduct(isNew ? null : id, body);
    navigate("/admin/products");
  }

  async function remove() {
    if (isNew) return;
    if (!confirm("حذف المنتج؟")) return;
    await api.deleteProduct(id);
    navigate("/admin/products");
  }

  return (
    <form onSubmit={save} className="max-w-3xl space-y-3">
      <h1 className="text-3xl font-extrabold">{isNew ? "منتج جديد" : "تعديل منتج"}</h1>
      <input className="input" placeholder="الاسم عربي" value={form.nameAr} onChange={(e) => patch("nameAr", e.target.value)} />
      <input className="input" placeholder="Name EN" value={form.nameEn} onChange={(e) => patch("nameEn", e.target.value)} />
      <input className="input" placeholder="slug" value={form.slug} onChange={(e) => patch("slug", e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className="input" type="number" placeholder="سعر قطر ر.ق" value={form.priceQar} onChange={(e) => patch("priceQar", e.target.value)} />
        <input className="input" type="number" placeholder="سعر السعودية ر.س" value={form.priceSar} onChange={(e) => patch("priceSar", e.target.value)} />
      </div>
      <input className="input" placeholder="الحجم" value={form.volume} onChange={(e) => patch("volume", e.target.value)} />
      <textarea className="input min-h-20" placeholder="وصف عربي" value={form.taglineAr} onChange={(e) => patch("taglineAr", e.target.value)} />
      <textarea className="input min-h-20" placeholder="Tagline EN" value={form.taglineEn} onChange={(e) => patch("taglineEn", e.target.value)} />
      <textarea className="input min-h-24" placeholder="فوائد (سطر لكل نقطة)" value={form.benefitsAr} onChange={(e) => patch("benefitsAr", e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.availableQa} onChange={(e) => patch("availableQa", e.target.checked)} /> متاح في قطر
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.availableSa} onChange={(e) => patch("availableSa", e.target.checked)} /> متاح في السعودية
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} /> ظاهر في المتجر
      </label>
      <div className="flex gap-3 pt-2">
        <button className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white">حفظ</button>
        {!isNew && (
          <button type="button" onClick={remove} className="rounded-full bg-crimson px-5 py-2.5 text-sm font-bold text-white">
            حذف
          </button>
        )}
      </div>
    </form>
  );
}
