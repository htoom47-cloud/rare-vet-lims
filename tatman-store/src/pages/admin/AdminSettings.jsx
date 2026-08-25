import { useEffect, useState } from "react";
import { api } from "../../api";
import { paymentLabel } from "../../data/payments";
import {
  COUNTRY_PRESETS,
  countryCodes,
  defaultCountryRow,
  isCoreCountry,
  isCountryCode,
  normalizeCountryCode,
  paymentKeysFor,
} from "../../data/countries";

const emptyNew = { code: "", nameAr: "", nameEn: "", currency: "", currencyAr: "" };

export function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addForm, setAddForm] = useState(emptyNew);

  async function load() {
    const d = await api.settings();
    setSettings(d.settings);
  }

  useEffect(() => {
    load().catch(() => setSettings(null));
  }, []);

  function patch(country, key, value) {
    setSettings((s) => ({ ...s, [country]: { ...s[country], [key]: value } }));
    setSaved("");
  }

  function patchPay(country, key, value) {
    setSettings((s) => ({
      ...s,
      [country]: { ...s[country], payments: { ...s[country].payments, [key]: value } },
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
      return true;
    } catch {
      setError("تعذر حفظ الإعدادات.");
      await load().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    await persist(settings, "تم الحفظ.");
  }

  function patchAdd(key, value) {
    setAddForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "code") {
        const code = normalizeCountryCode(value);
        const preset = COUNTRY_PRESETS[code];
        if (preset) {
          if (!f.nameAr) next.nameAr = preset.nameAr;
          if (!f.nameEn) next.nameEn = preset.nameEn;
          if (!f.currency) next.currency = preset.currency;
          if (!f.currencyAr) next.currencyAr = preset.currencyAr;
        }
      }
      return next;
    });
    setError("");
  }

  async function addCountry(e) {
    e.preventDefault();
    const code = normalizeCountryCode(addForm.code);
    if (!isCountryCode(code)) {
      setError("أدخل رمز الدولة بحرفين أو ثلاثة، مثال: AE");
      return;
    }
    if (settings[code]) {
      setError("هذه الدولة موجودة مسبقاً.");
      return;
    }
    const row = defaultCountryRow(code, {
      nameAr: addForm.nameAr,
      nameEn: addForm.nameEn,
      currency: addForm.currency,
      currencyAr: addForm.currencyAr,
      whatsapp: settings.qa?.whatsapp,
      accountName: settings.qa?.accountName,
    });
    if (!row.nameAr || !row.currency || !row.currencyAr) {
      setError("أدخل اسم الدولة والعملة ورمز العملة.");
      return;
    }
    const ok = await persist({ ...settings, [code]: row }, "تمت إضافة الدولة.");
    if (ok) setAddForm(emptyNew);
  }

  async function removeCountry(code) {
    if (isCoreCountry(code)) return;
    if (!confirm(`حذف دولة ${settings[code]?.nameAr || code}؟ لن تُحذف الطلبات السابقة.`)) return;
    const next = { ...settings };
    delete next[code];
    await persist(next, "تم حذف الدولة.");
  }

  if (!settings) return <p>...</p>;

  const codes = countryCodes(settings);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">إعدادات الدول والدفع</h1>
        <p className="mt-2 text-sm text-black/55">قطر والسعودية ثابتتان. يمكنك إضافة دولة أخرى مع عملتها.</p>
        {error && <p className="mt-3 text-sm font-bold text-crimson">{error}</p>}
      </div>

      <form onSubmit={addCountry} className="rounded-2xl bg-white p-5 ring-1 ring-navy/10">
        <h2 className="text-lg font-extrabold text-navy">إضافة دولة والعملة</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-bold text-navy">رمز الدولة</span>
            <input className="input" dir="ltr" placeholder="AE" value={addForm.code} onChange={(e) => patchAdd("code", e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold text-navy">الاسم بالعربية</span>
            <input className="input" placeholder="الإمارات" value={addForm.nameAr} onChange={(e) => patchAdd("nameAr", e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold text-navy">الاسم بالإنجليزية</span>
            <input className="input" dir="ltr" placeholder="UAE" value={addForm.nameEn} onChange={(e) => patchAdd("nameEn", e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold text-navy">العملة</span>
            <input className="input" dir="ltr" placeholder="AED" value={addForm.currency} onChange={(e) => patchAdd("currency", e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold text-navy">رمز العملة</span>
            <input className="input" placeholder="د.إ" value={addForm.currencyAr} onChange={(e) => patchAdd("currencyAr", e.target.value)} />
          </label>
        </div>
        <button disabled={busy} className="mt-4 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {busy ? "جاري الإضافة..." : "إضافة الدولة"}
        </button>
      </form>

      <form onSubmit={save} className="space-y-8">
        {codes.map((code) => (
          <section key={code} className="rounded-2xl bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold">{settings[code]?.nameAr || code} · {settings[code]?.currency}</h2>
              {!isCoreCountry(code) && (
                <button type="button" disabled={busy} className="text-sm font-bold text-crimson" onClick={() => removeCountry(code)}>
                  حذف الدولة
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">اسم الدولة بالعربية</span>
                <input className="input" value={settings[code].nameAr || ""} onChange={(e) => patch(code, "nameAr", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">اسم الدولة بالإنجليزية</span>
                <input className="input" dir="ltr" value={settings[code].nameEn || ""} onChange={(e) => patch(code, "nameEn", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">العملة</span>
                <input className="input" dir="ltr" value={settings[code].currency || ""} onChange={(e) => patch(code, "currency", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">رمز العملة</span>
                <input className="input" value={settings[code].currencyAr || ""} onChange={(e) => patch(code, "currencyAr", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">واتساب</span>
                <input className="input" value={settings[code].whatsapp} onChange={(e) => patch(code, "whatsapp", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">اسم الحساب</span>
                <input className="input" value={settings[code].accountName} onChange={(e) => patch(code, "accountName", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">البنك</span>
                <input className="input" value={settings[code].bankName} onChange={(e) => patch(code, "bankName", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-navy">IBAN</span>
                <input className="input" value={settings[code].iban} onChange={(e) => patch(code, "iban", e.target.value)} />
              </label>
            </div>
            <p className="mt-5 text-sm font-bold text-navy">طرق الدفع</p>
            <div className="mt-2 grid gap-2 text-sm">
              {paymentKeysFor(code).map((key) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings[code].payments?.[key])}
                    onChange={(e) => patchPay(code, key, e.target.checked)}
                  />
                  تفعيل {paymentLabel(key)}
                </label>
              ))}
            </div>
          </section>
        ))}
        {error && <p className="text-sm font-bold text-crimson">{error}</p>}
        <button disabled={busy} className="rounded-full bg-navy px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>
        {saved && <span className="ms-3 text-sm text-medical">{saved}</span>}
      </form>
    </div>
  );
}
