import { useEffect, useState } from "react";
import { api } from "../../api";
import { shapeCourier } from "../../data/couriers";

export function AdminShipping() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ qa: "", sa: "" });

  async function load() {
    const d = await api.settings();
    setSettings(d.settings);
  }

  useEffect(() => {
    load().catch(() => setSettings(null));
  }, []);

  function patchCourier(code, id, key, value) {
    setSettings((s) => ({
      ...s,
      [code]: {
        ...s[code],
        couriers: (s[code].couriers || []).map((c) => (c.id === id ? { ...c, [key]: value } : c)),
      },
    }));
    setSaved("");
  }

  function addCustom(code) {
    const nameAr = custom[code].trim();
    if (!nameAr) return;
    const row = shapeCourier({
      id: `c-${Date.now().toString(36)}`,
      nameAr,
      nameEn: nameAr,
      active: true,
      fee: 0,
    });
    setSettings((s) => ({
      ...s,
      [code]: { ...s[code], couriers: [...(s[code].couriers || []), row] },
    }));
    setCustom((c) => ({ ...c, [code]: "" }));
    setSaved("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const d = await api.saveSettings(settings);
      setSettings(d.settings);
      setSaved("تم حفظ شركات التوصيل.");
    } catch {
      setError("تعذر الحفظ. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p>...</p>;

  return (
    <form onSubmit={save} className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">شركات التوصيل</h1>
        <p className="mt-2 text-sm text-black/55">
          فعّل الشركات التي تتعامل معها لكل دولة، وحدّد رسوم التوصيل. تظهر للمشتري عند الدفع. إن لم تُفعَّل أي شركة يبقى الطلب كما هو عبر واتساب.
        </p>
      </div>
      {["qa", "sa"].map((code) => (
        <section key={code} className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-extrabold">{code === "qa" ? "قطر" : "السعودية"}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-mist text-right">
                <tr>
                  <th className="p-2">تفعيل</th>
                  <th className="p-2">الشركة</th>
                  <th className="p-2">الرسوم</th>
                  <th className="p-2">مدة تقريبية</th>
                  <th className="p-2">رابط التتبع</th>
                </tr>
              </thead>
              <tbody>
                {(settings[code].couriers || []).map((c) => (
                  <tr key={c.id} className="border-t border-black/5">
                    <td className="p-2">
                      <input type="checkbox" checked={c.active === true} onChange={(e) => patchCourier(code, c.id, "active", e.target.checked)} />
                    </td>
                    <td className="p-2 font-bold">{c.nameAr}</td>
                    <td className="p-2">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={c.fee || 0}
                        onChange={(e) => patchCourier(code, c.id, "fee", e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="input"
                        value={c.etaAr || ""}
                        placeholder="1–2 يوم"
                        onChange={(e) => patchCourier(code, c.id, "etaAr", e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="input"
                        dir="ltr"
                        value={c.trackUrl || ""}
                        placeholder="https://...{code}"
                        onChange={(e) => patchCourier(code, c.id, "trackUrl", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="input max-w-xs"
              value={custom[code]}
              placeholder="شركة إضافية"
              onChange={(e) => setCustom((c) => ({ ...c, [code]: e.target.value }))}
            />
            <button type="button" className="rounded-full bg-mist px-4 py-2 text-sm font-bold text-navy" onClick={() => addCustom(code)}>
              إضافة شركة
            </button>
          </div>
        </section>
      ))}
      {error && <p className="text-sm font-bold text-crimson">{error}</p>}
      <button disabled={busy} className="rounded-full bg-navy px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
        {busy ? "جاري الحفظ..." : "حفظ شركات التوصيل"}
      </button>
      {saved && <span className="ms-3 text-sm font-bold text-medical">{saved}</span>}
    </form>
  );
}
