import { useEffect, useState } from "react";
import { api } from "../../api";
import { paymentLabel } from "../../data/payments";
import { countryLabel, ORDER_STATUSES } from "../../data/orders";
import { trackingLink } from "../../data/couriers";

export function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [countries, setCountries] = useState([
    { code: "qa", nameAr: "قطر" },
    { code: "sa", nameAr: "السعودية" },
  ]);
  const [country, setCountry] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const d = await api.orders();
    setOrders(d.orders || []);
    if (d.countries?.length) setCountries(d.countries);
  }

  useEffect(() => {
    load().catch(() => setOrders([]));
  }, []);

  const shown = orders.filter((o) => {
    const countryOk = country === "all" || o.country === country;
    const statusOk = statusFilter === "all" || (o.status || "new") === statusFilter;
    return countryOk && statusOk;
  });

  async function setStatus(id, status) {
    setError("");
    setBusyId(id);
    try {
      const data = await api.updateOrder(id, { status });
      if (!data.order?.id) throw new Error("save_failed");
      await load();
    } catch {
      setError("تعذر تحديث حالة الطلب. حاول مرة أخرى.");
      await load().catch(() => {});
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold">الطلبات</h1>
      <p className="mt-2 text-sm text-black/55">لكل طلب خانة حالة تُحفظ في النظام بعد التغيير.</p>
      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-2 text-xs font-bold text-black/50">الدولة</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "كل الدول"],
              ...countries.map((c) => [c.code, c.nameAr]),
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
        </div>
        <div>
          <p className="mb-2 text-xs font-bold text-black/50">حالة الطلب</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${statusFilter === "all" ? "bg-navy text-white" : "bg-white"}`}
            >
              كل الحالات
            </button>
            {ORDER_STATUSES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${statusFilter === id ? "bg-navy text-white" : "bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-sm font-bold text-crimson">{error}</p>}
      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-mist text-right">
            <tr>
              <th className="p-3">رقم الطلب</th>
              <th className="p-3">الاسم</th>
              <th className="p-3">الرقم</th>
              <th className="p-3">الدولة</th>
              <th className="p-3">المنتجات</th>
              <th className="p-3">التوصيل</th>
              <th className="p-3">الإجمالي</th>
              <th className="p-3">حالة الطلب</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id} className="border-t border-black/5 align-top">
                <td className="p-3">
                  <strong>{o.id}</strong>
                  <div className="mt-1 text-xs text-black/50">{paymentLabel(o.paymentMethod)}</div>
                  {o.couponCode ? (
                    <div className="mt-1 text-xs font-bold text-navy">
                      كود {o.couponCode}
                      {o.discount ? ` (−${o.discount})` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="p-3 font-bold">{o.customer?.name || "—"}</td>
                <td className="p-3" dir="ltr">
                  {o.customer?.phone || "—"}
                </td>
                <td className="p-3">{countries.find((x) => x.code === o.country)?.nameAr || countryLabel(o.country)}</td>
                <td className="p-3 text-black/70">
                  {(o.items || []).map((i) => (
                    <div key={i.id}>
                      {i.nameAr} × {i.qty}
                    </div>
                  ))}
                </td>
                <td className="p-3">
                  {o.shipping?.nameAr ? (
                    <>
                      <div className="font-bold">{o.shipping.nameAr}</div>
                      {o.shippingFee ? (
                        <div className="text-xs text-black/50">
                          {o.shippingFee} {o.currency}
                        </div>
                      ) : null}
                      <input
                        className="input mt-2"
                        placeholder="رقم التتبع"
                        defaultValue={o.trackingNumber || ""}
                        onBlur={async (e) => {
                          const v = e.target.value.trim();
                          if (v === (o.trackingNumber || "")) return;
                          await api.updateOrder(o.id, { trackingNumber: v });
                          load();
                        }}
                      />
                      {trackingLink(o.shipping, o.trackingNumber) ? (
                        <a
                          className="mt-1 inline-block text-xs font-bold text-medical"
                          href={trackingLink(o.shipping, o.trackingNumber)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          تتبع الشحنة
                        </a>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {o.total} {o.currency}
                </td>
                <td className="p-3">
                  <label className="block space-y-1">
                    <span className="sr-only">حالة الطلب</span>
                    <select
                      className="input min-w-[10rem]"
                      value={o.status || "new"}
                      disabled={busyId === o.id}
                      onChange={(e) => setStatus(o.id, e.target.value)}
                    >
                      {ORDER_STATUSES.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-black/50">لا توجد طلبات.</p>}
      </div>
    </div>
  );
}
