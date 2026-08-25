import { useEffect, useState } from "react";
import { api } from "../../api";
import { paymentLabel } from "../../data/payments";

const PAY_KEYS = {
  qa: ["whatsapp", "bank", "cod", "card", "applePay"],
  sa: ["whatsapp", "bank", "cod", "mada", "applePay"],
};

export function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const d = await api.saveSettings(settings);
      setSettings(d.settings);
      setSaved("تم الحفظ.");
    } catch {
      setError("تعذر حفظ الإعدادات.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p>...</p>;

  return (
    <form onSubmit={save} className="space-y-8">
      <h1 className="text-3xl font-extrabold">إعدادات الدول والدفع</h1>
      {["qa", "sa"].map((code) => (
        <section key={code} className="rounded-2xl bg-white p-5">
          <h2 className="text-xl font-extrabold">{code === "qa" ? "المتجر القطري" : "المتجر السعودي"}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            {PAY_KEYS[code].map((key) => (
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
  );
}
