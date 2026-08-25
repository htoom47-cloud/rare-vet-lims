import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

export function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.overview().then(setData).catch(() => setData(null));
  }, []);
  if (!data) return <p>...</p>;
  const cards = [
    ["المنتجات", data.productCount],
    ["كل الطلبات", data.orderCount],
    ["جديدة", data.newOrders],
    ["طلبات قطر", data.qaOrders],
    ["طلبات السعودية", data.saOrders],
  ];
  return (
    <div>
      <h1 className="text-3xl font-extrabold">لوحة التحكم</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-black/50">{label}</p>
            <p className="mt-2 text-3xl font-extrabold text-navy">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Link to="/admin/products" className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white">
          إدارة المنتجات
        </Link>
        <Link to="/admin/orders" className="rounded-full bg-crimson px-5 py-2.5 text-sm font-bold text-white">
          الطلبات
        </Link>
      </div>
    </div>
  );
}
