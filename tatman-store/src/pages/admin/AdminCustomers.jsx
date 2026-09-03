import { useEffect, useState } from "react";
import { api } from "../../api";

export function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [countries, setCountries] = useState([
    { code: "qa", nameAr: "قطر" },
    { code: "sa", nameAr: "السعودية" },
  ]);
  const [country, setCountry] = useState("all");

  async function load() {
    const d = await api.customers();
    setCustomers(d.customers || []);
    if (d.countries?.length) setCountries(d.countries);
  }

  useEffect(() => {
    load().catch(() => setCustomers([]));
  }, []);

  const shown = customers.filter((c) => country === "all" || (c.countries || []).includes(country));

  return (
    <div>
      <h1 className="text-3xl font-extrabold">العملاء</h1>
      <p className="mt-2 text-sm text-black/55">العملاء المسجّلون من طلبات المتجر: الاسم والرقم والدولة.</p>
      <div className="mt-4 flex gap-2">
        {[
          ["all", "الكل"],
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
      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-mist text-right">
            <tr>
              <th className="p-3">الاسم</th>
              <th className="p-3">الرقم</th>
              <th className="p-3">الدولة</th>
              <th className="p-3">عدد الطلبات</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-t border-black/5">
                <td className="p-3 font-bold">{c.name || "—"}</td>
                <td className="p-3" dir="ltr">
                  {c.phone || "—"}
                </td>
                <td className="p-3">{(c.countries || []).map((code) => countries.find((x) => x.code === code)?.nameAr || code).join(" / ")}</td>
                <td className="p-3">{c.orderCount || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-black/50">لا يوجد عملاء مسجّلون بعد.</p>}
      </div>
    </div>
  );
}
