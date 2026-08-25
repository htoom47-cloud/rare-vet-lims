import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

export function AdminProducts() {
  const [products, setProducts] = useState([]);

  async function load() {
    const d = await api.products();
    setProducts(d.products || []);
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
              <th className="p-3">الاسم</th>
              <th className="p-3">قطر</th>
              <th className="p-3">السعودية</th>
              <th className="p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="p-3">
                  <div className="font-bold">{p.nameAr}</div>
                  <div className="text-xs text-black/50">{p.nameEn}</div>
                </td>
                <td className="p-3">{p.availableQa === false ? "—" : `${p.priceQar} ر.ق`}</td>
                <td className="p-3">{p.availableSa === false ? "—" : `${p.priceSar} ر.س`}</td>
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
