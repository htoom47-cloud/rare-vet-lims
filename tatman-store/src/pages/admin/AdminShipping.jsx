import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

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

  async function persist(next, message) {
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const d = await api.saveSettings(next);
      if (!d.settings) throw new Error("save_failed");
      setSettings(d.settings);
      setSaved(message);
      return d.settings;
    } catch {
      setError("تعذر الحفظ. حاول مرة أخرى.");
      await load().catch(() => {});
      return null;
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
    const savedSettings = await persist(next, "تمت إضافة شركة التوصيل.");
    if (savedSettings) navigate(`/admin/shipping/${code}/${row.id}`);
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

  if (!settings) return <p>...</p>;

  const codes = countryCodes(settings);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">شركات التوصيل</h1>
        <p className="mt-2 text-sm text-black/55">افتح صفحة كل شركة لضبط التسعيرة والحالة ومدة الشحن. الإضافة والحذف يُحفظان مباشرة.</p>
      </div>
      {codes.map((code) => (
        <section key={code} className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-extrabold">{settings[code]?.nameAr || code}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(settings[code].couriers || []).map((c) => (
              <article key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-mist/60 p-4 ring-1 ring-navy/5">
                <div className="flex min-w-0 items-center gap-3">
                  {c.logo ? (
                    <img src={c.logo} alt="" className="h-11 w-11 rounded-xl bg-white object-contain ring-1 ring-navy/10" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sm font-extrabold text-navy ring-1 ring-navy/10">
                      {(c.nameAr || "?").slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-navy">{c.displayName || c.nameAr}</p>
                    <p className="text-xs text-black/50">
                      {c.active ? "مفعّلة" : "متوقفة"}
                      {c.fee ? ` · ${c.fee} ${settings[code]?.currencyAr || ""}` : " · بدون رسوم"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <Link className="font-bold text-medical" to={`/admin/shipping/${code}/${c.id}`}>
                    إعدادات
                  </Link>
                  <button type="button" className="font-bold text-crimson" disabled={busy} onClick={() => removeCompany(code, c.id)}>
                    حذف
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!(settings[code].couriers || []).length && <p className="mt-3 text-sm text-black/50">لا توجد شركات. أضف شركة أدناه.</p>}
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
      {saved && <p className="text-sm font-bold text-medical">{saved}</p>}
    </div>
  );
}
