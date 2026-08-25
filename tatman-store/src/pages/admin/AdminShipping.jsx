import { useEffect, useState } from "react";
import { api } from "../../api";
import { shapeCourier } from "../../data/couriers";
import { countryCodes } from "../../data/countries";

function emptyCustom(settings) {
  const out = {};
  for (const code of countryCodes(settings)) out[code] = { nameAr: "", fee: "" };
  return out;
}

export function AdminShipping() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({});

  async function load() {
    const d = await api.settings();
    setSettings(d.settings);
    setCustom((prev) => {
      const next = emptyCustom(d.settings);
      for (const code of Object.keys(next)) {
        if (prev[code]) next[code] = prev[code];
      }
      return next;
    });
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

  async function persist(next, message) {
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const d = await api.saveSettings(next);
      if (!d.settings) throw new Error("save_failed");
      setSettings(d.settings);
      setSaved(message);
    } catch {
      setError("تعذر الحفظ. حاول مرة أخرى.");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function addCompany(code) {
    const nameAr = (custom[code] || {}).nameAr?.trim();
    if (!nameAr) {
      setError("أدخل اسم شركة التوصيل.");
      return;
    }
    const exists = (settings[code].couriers || []).some((c) => c.nameAr.trim() === nameAr);
    if (exists) {
      setError("هذه الشركة موجودة مسبقاً.");
      return;
    }
    const row = shapeCourier({
      id: `c-${Date.now().toString(36)}`,
      nameAr,
      nameEn: nameAr,
      active: true,
      fee: (custom[code] || {}).fee,
    });
    const next = {
      ...settings,
      [code]: { ...settings[code], couriers: [...(settings[code].couriers || []), row] },
    };
    setCustom((c) => ({ ...c, [code]: { nameAr: "", fee: "" } }));
    await persist(next, "تمت إضافة شركة التوصيل.");
  }

  async function removeCompany(code, id) {
    if (!confirm("حذف شركة التوصيل؟")) return;
    const next = {
      ...settings,
      [code]: {
        ...settings[code],
        couriers: (settings[code].couriers || []).filter((c) => c.id !== id),
      },
    };
    await persist(next, "تم حذف شركة التوصيل.");
  }

  async function save(e) {
    e.preventDefault();
    await persist(settings, "تم حفظ شركات التوصيل.");
  }

  if (!settings) return <p>...</p>;

  const codes = countryCodes(settings);

  return (
    <form onSubmit={save} className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">شركات التوصيل</h1>
        <p className="mt-2 text-sm text-black/55">أضف أو احذف الشركات لكل دولة. الإضافة والحذف يُحفظان مباشرة.</p>
      </div>
      {codes.map((code) => (
        <section key={code} className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-extrabold">{settings[code]?.nameAr || code}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-mist text-right">
                <tr>
                  <th className="p-2">تفعيل</th>
                  <th className="p-2">الشركة</th>
                  <th className="p-2">الرسوم</th>
                  <th className="p-2">مدة تقريبية</th>
                  <th className="p-2">رابط التتبع</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(settings[code].couriers || []).map((c) => (
                  <tr key={c.id} className="border-t border-black/5">
                    <td className="p-2">
                      <input type="checkbox" checked={c.active === true} onChange={(e) => patchCourier(code, c.id, "active", e.target.checked)} />
                    </td>
                    <td className="p-2">
                      <input className="input" value={c.nameAr} onChange={(e) => patchCourier(code, c.id, "nameAr", e.target.value)} />
                    </td>
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
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-sm font-bold text-crimson"
                        disabled={busy}
                        onClick={() => removeCompany(code, c.id)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(settings[code].couriers || []).length && <p className="p-3 text-sm text-black/50">لا توجد شركات. أضف شركة أدناه.</p>}
          </div>
          <div className="mt-4 rounded-xl bg-mist p-4">
            <p className="text-sm font-bold text-navy">إضافة شركة توصيل</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="block min-w-[12rem] flex-1 space-y-1">
                <span className="text-xs font-bold text-black/50">اسم الشركة</span>
                <input
                  className="input"
                  value={(custom[code] || {}).nameAr || ""}
                  placeholder="مثال: أرامكس"
                  onChange={(e) => setCustom((c) => ({ ...c, [code]: { ...(c[code] || { nameAr: "", fee: "" }), nameAr: e.target.value } }))}
                />
              </label>
              <label className="block w-28 space-y-1">
                <span className="text-xs font-bold text-black/50">الرسوم</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={(custom[code] || {}).fee || ""}
                  placeholder="0"
                  onChange={(e) => setCustom((c) => ({ ...c, [code]: { ...(c[code] || { nameAr: "", fee: "" }), fee: e.target.value } }))}
                />
              </label>
              <button
                type="button"
                disabled={busy}
                className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                onClick={() => addCompany(code)}
              >
                إضافة
              </button>
            </div>
          </div>
        </section>
      ))}
      {error && <p className="text-sm font-bold text-crimson">{error}</p>}
      <button disabled={busy} className="rounded-full bg-navy px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
        {busy ? "جاري الحفظ..." : "حفظ التعديلات"}
      </button>
      {saved && <span className="ms-3 text-sm font-bold text-medical">{saved}</span>}
    </form>
  );
}
