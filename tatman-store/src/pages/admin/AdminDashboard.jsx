import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../../api";
import { can } from "../../data/permissions";

export function AdminDashboard() {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [revenue, setRevenue] = useState(null);

  useEffect(() => {
    api.overview().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!can(user, "revenue")) return;
    api.revenue("all").then(setRevenue).catch(() => setRevenue(null));
  }, [user]);

  if (!data) return <p>...</p>;
  const cards = [
    ["المنتجات", data.productCount],
    ["كل الطلبات", data.orderCount],
    ["جديدة", data.newOrders],
    ["طلبات قطر", data.qaOrders],
    ["طلبات السعودية", data.saOrders],
    ["أكواد الخصم", data.couponCount ?? 0],
    ["العملاء", data.customerCount ?? 0],
  ];
  return (
    <div>
      <h1 className="text-3xl font-extrabold">لوحة التحكم</h1>
      <p className="mt-1 text-sm text-black/50">مرحباً {user?.name}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-black/50">{label}</p>
            <p className="mt-2 text-3xl font-extrabold text-navy">{value}</p>
          </div>
        ))}
      </div>
      {revenue ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-navy p-5 text-white">
            <p className="text-sm text-white/70">إيراد قطر المحصّل</p>
            <p className="mt-2 text-3xl font-extrabold text-sand">
              {revenue.qa?.net || 0} {revenue.qa?.currencyAr}
            </p>
            <p className="mt-1 text-xs text-white/60">{revenue.qa?.countedCount || 0} طلب محتسب</p>
          </div>
          <div className="rounded-2xl bg-navy p-5 text-white">
            <p className="text-sm text-white/70">إيراد السعودية المحصّل</p>
            <p className="mt-2 text-3xl font-extrabold text-sand">
              {revenue.sa?.net || 0} {revenue.sa?.currencyAr}
            </p>
            <p className="mt-1 text-xs text-white/60">{revenue.sa?.countedCount || 0} طلب محتسب</p>
          </div>
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        {can(user, "products") && (
          <Link to="/admin/products" className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white">
            إدارة المنتجات
          </Link>
        )}
        {can(user, "orders") && (
          <Link to="/admin/orders" className="rounded-full bg-crimson px-5 py-2.5 text-sm font-bold text-white">
            الطلبات
          </Link>
        )}
        {can(user, "customers") && (
          <Link to="/admin/customers" className="rounded-full bg-steel px-5 py-2.5 text-sm font-bold text-white">
            العملاء
          </Link>
        )}
        {can(user, "revenue") && (
          <Link to="/admin/revenue" className="rounded-full bg-sage px-5 py-2.5 text-sm font-bold text-white">
            الإيرادات
          </Link>
        )}
        {can(user, "coupons") && (
          <Link to="/admin/coupons" className="rounded-full bg-medical px-5 py-2.5 text-sm font-bold text-white">
            أكواد الخصم
          </Link>
        )}
        {can(user, "users") && (
          <Link to="/admin/users" className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white">
            المستخدمون
          </Link>
        )}
      </div>
    </div>
  );
}
