import { useEffect, useState } from "react";
import { api } from "../../api";

export function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings().then((d) => setSettings(d.settings));
  }, []);

  function patch(country, key, value) {
    setSettings((s) => ({ ...s, [country]: { ...s[country], [key]: value } }));
  }

  function patchPay(country, key, value) {
    setSettings((s) => ({
      ...s,
      [country]: { ...s[country], payments: { ...s[country].payments, [key]: value } },
    }));
  }

  async function save(e) {
    e.preventDefault();
    await api.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <p>...</p>;

  return (
    <form onSubmit={save} className="space-y-8">
      <h1 className="text-3xl font-extrabold">إعدادات الدول والدفع</h1>
      {["qa", "sa"].map((code) => (
        <section key={code} className="rounded-2xl bg-white p-5">
          <h2 className="text-xl font-extrabold">{code === "qa" ? "المتجر القطري" : "المتجر السعودي"}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder="واتساب" value={settings[code].whatsapp} onChange={(e) => patch(code, "whatsapp", e.target.value)} />
            <input className="input" placeholder="اسم الحساب" value={settings[code].accountName} onChange={(e) => patch(code, "accountName", e.target.value)} />
            <input className="input" placeholder="البنك" value={settings[code].bankName} onChange={(e) => patch(code, "bankName", e.target.value)} />
            <input className="input" placeholder="IBAN" value={settings[code].iban} onChange={(e) => patch(code, "iban", e.target.value)} />
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            {Object.keys(settings[code].payments || {}).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(settings[code].payments[k])}
                  onChange={(e) => patchPay(code, k, e.target.checked)}
                />
                تفعيل {k}
              </label>
            ))}
          </div>
        </section>
      ))}
      <button className="rounded-full bg-navy px-6 py-3 text-sm font-bold text-white">حفظ الإعدادات</button>
      {saved && <span className="ms-3 text-sm text-medical">تم الحفظ</span>}
    </form>
  );
}
