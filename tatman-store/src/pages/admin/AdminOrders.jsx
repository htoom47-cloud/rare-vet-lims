import { useEffect, useState } from "react";
import { api } from "../../api";

const statuses = [
  ["new", "جديد"],
  ["pending_payment", "بانتظار الدفع"],
  ["confirmed", "مؤكد"],
  ["paid", "مدفوع"],
  ["shipped", "تم الشحن"],
  ["cancelled", "ملغى"],
];

export function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [country, setCountry] = useState("all");

  async function load() {
    const d = await api.orders();
    setOrders(d.orders || []);
  }

  useEffect(() => {
    load().catch(() => setOrders([]));
  }, []);

  const shown = orders.filter((o) => country === "all" || o.country === country);

  return (
    <div>
      <h1 className="text-3xl font-extrabold">الطلبات</h1>
      <div className="mt-4 flex gap-2">
        {[
          ["all", "الكل"],
          ["qa", "قطر"],
          ["sa", "السعودية"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCountry(id)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${country === id ? "bg-navy text-white" : "bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-4">
        {shown.map((o) => (
          <article key={o.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{o.id}</strong>
              <span>{o.country === "sa" ? "السعودية" : "قطر"}</span>
              <span>
                {o.total} {o.currency}
              </span>
            </div>
            <p className="mt-2 text-sm">
              {o.customer?.name} · {o.customer?.phone} · {o.paymentMethod}
            </p>
            <ul className="mt-2 text-sm text-black/70">
              {o.items.map((i) => (
                <li key={i.id}>
                  {i.nameAr} × {i.qty}
                </li>
              ))}
            </ul>
            <select
              className="input mt-3"
              value={o.status}
              onChange={async (e) => {
                await api.updateOrder(o.id, { status: e.target.value });
                load();
              }}
            >
              {statuses.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </article>
        ))}
        {!shown.length && <p className="text-black/50">لا توجد طلبات.</p>}
      </div>
    </div>
  );
}
