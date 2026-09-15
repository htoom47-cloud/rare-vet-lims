import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { productImage } from "../../data/stock";

export function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [extras, setExtras] = useState([]);

  async function load() {
    const p = await api.products();
    setProducts(p.products || []);
    setExtras((p.countries || []).filter((c) => c.code !== "qa" && c.code !== "sa"));
  }

  useEffect(() => {
    load().catch(() => setProducts([]));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">المنتجات</h1>
        <Link to="/admin/products/new" className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-white">
          منتج جديد
        </Link>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-mist text-right">
            <tr>
              <th className="p-3">الصورة</th>
              <th className="p-3">الاسم</th>
              <th className="p-3">قطر</th>
              <th className="p-3">السعودية</th>
              {extras.map((c) => (
                <th key={c.code} className="p-3">{c.nameAr}</th>
              ))}
              <th className="p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="p-3">
                  {productImage(p) ? (
                    <img src={productImage(p)} alt="" className="h-12 w-12 rounded-lg object-contain bg-mist ring-1 ring-navy/10" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mist text-[10px] text-black/40">بدون</div>
                  )}
                </td>
                <td className="p-3">
                  <div className="font-bold">{p.nameAr}</div>
                  <div className="text-xs text-black/50">{p.nameEn}</div>
                </td>
                <td className="p-3">
                  {p.availableQa === false ? "—" : `${p.priceQar} ر.ق`}
                  <div className="text-xs text-black/50">{stockLabel(p.stockQa)}</div>
                </td>
                <td className="p-3">
                  {p.availableSa === false ? "—" : `${p.priceSar} ر.س`}
                  <div className="text-xs text-black/50">{stockLabel(p.stockSa)}</div>
                </td>
                {extras.map((c) => (
                  <td key={c.code} className="p-3">
                    {p.available?.[c.code] === false ? "—" : `${p.prices?.[c.code] || p.priceQar || 0} ${c.currencyAr}`}
                    <div className="text-xs text-black/50">{stockLabel(p.stock?.[c.code])}</div>
                  </td>
                ))}
                <td className="p-3">{p.active === false ? "مخفي" : "ظاهر"}</td>
                <td className="p-3">
                  <Link className="font-bold text-medical" to={`/admin/products/${p.id}`}>
                    تعديل
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function stockLabel(value) {
  if (value === null || value === undefined || value === "") return "مخزون غير محدد";
  const n = Number(value);
  if (!Number.isFinite(n)) return "مخزون غير محدد";
  if (n <= 0) return "غير متوفر";
  return `المتوفر: ${n}`;
}
