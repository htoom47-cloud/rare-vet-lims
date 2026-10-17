import { useEffect, useState } from "react";
import { api } from "../../api";
import { paymentLabel } from "../../data/payments";
import { ORDER_STATUSES } from "../../data/orders";
import { periodLabel } from "../../data/revenue";

function money(n, currencyAr) {
  return `${Number(n) || 0} ${currencyAr}`;
}

function CountryRevenue({ title, block }) {
  if (!block) return null;
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy/5">
      <h2 className="text-xl font-extrabold text-navy">{title}</h2>
      <p className="mt-1 text-sm text-black/50">{block.countedCount} طلب محتسب · {block.pendingCount} قيد التحصيل · {block.cancelledCount} ملغى</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-mist p-4">
          <p className="text-xs text-black/50">الإيراد المحصّل</p>
          <p className="mt-1 text-2xl font-extrabold text-navy">{money(block.net, block.currencyAr)}</p>
        </div>
        <div className="rounded-xl bg-mist p-4">
          <p className="text-xs text-black/50">قبل الخصم</p>
          <p className="mt-1 text-2xl font-extrabold">{money(block.gross, block.currencyAr)}</p>
        </div>
        <div className="rounded-xl bg-mist p-4">
          <p className="text-xs text-black/50">الخصومات</p>
          <p className="mt-1 text-xl font-extrabold text-crimson">{money(block.discount, block.currencyAr)}</p>
        </div>
        <div className="rounded-xl bg-mist p-4">
          <p className="text-xs text-black/50">بانتظار التحصيل</p>
          <p className="mt-1 text-xl font-extrabold">{money(block.pendingNet, block.currencyAr)}</p>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-extrabold">حسب حالة الطلب</h3>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {ORDER_STATUSES.map(([id, label]) => (
            <tr key={id} className="border-t border-black/5">
              <td className="py-2">{label}</td>
              <td className="py-2">{block.byStatus?.[id]?.count || 0}</td>
              <td className="py-2 text-left" dir="ltr">
                {money(block.byStatus?.[id]?.total, block.currencyAr)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 text-sm font-extrabold">حسب طريقة الدفع</h3>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {Object.entries(block.byPayment || {}).length ? (
            Object.entries(block.byPayment).map(([id, row]) => (
              <tr key={id} className="border-t border-black/5">
                <td className="py-2">{paymentLabel(id)}</td>
                <td className="py-2">{row.count}</td>
                <td className="py-2 text-left" dir="ltr">
                  {money(row.total, block.currencyAr)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="py-2 text-black/50">لا بيانات</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="mt-6 text-sm font-extrabold">أعلى المنتجات مبيعاً</h3>
      <ul className="mt-2 text-sm">
        {(block.topProducts || []).length ? (
          block.topProducts.map((p) => (
            <li key={p.id} className="flex justify-between border-t border-black/5 py-2">
              <span>
                {p.nameAr} × {p.qty}
              </span>
              <span>{money(p.total, block.currencyAr)}</span>
            </li>
          ))
        ) : (
          <li className="text-black/50">لا مبيعات محتسبة بعد.</li>
        )}
      </ul>
    </section>
  );
}

export function AdminRevenue() {
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load(nextPeriod = period) {
    const d = await api.revenue(nextPeriod);
    setData(d);
  }

  useEffect(() => {
    load(period).catch(() => {
      setData(null);
      setError("تعذر تحميل الإيرادات.");
    });
  }, [period]);

  return (
    <div>
      <h1 className="text-3xl font-extrabold">الإيرادات</h1>
      <p className="mt-2 text-sm text-black/55">
        الإيراد المحصّل من الطلبات المؤكدة والمدفوعة والمشحونة فقط. عملات الدول مفصولة ولا تُخلط. الملغى لا يُحتسب.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ["all", "كل الفترة"],
          ["month", "هذا الشهر"],
          ["today", "اليوم"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${period === id ? "bg-navy text-white" : "bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm font-bold text-crimson">{error}</p>}
      {data ? (
        <div className={`mt-6 grid gap-6 ${Object.keys(data).filter((k) => k !== "period").length > 2 ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"}`}>
          {Object.entries(data)
            .filter(([key]) => key !== "period")
            .map(([code, block]) => (
              <CountryRevenue key={code} title={`${block.nameAr || code} · ${periodLabel(period)}`} block={block} />
            ))}
        </div>
      ) : (
        !error && <p className="mt-6">...</p>
      )}
    </div>
  );
}
