export const COURIER_PRESETS = [
  { id: "pickup", ar: "استلام من المتجر", en: "Store pickup", countries: ["qa", "sa"], trackUrl: "" },
  { id: "aramex", ar: "أرامكس", en: "Aramex", countries: ["qa", "sa"], trackUrl: "https://www.aramex.com/track/results?mode=0&shipmentNumber={code}" },
  { id: "dhl", ar: "DHL", en: "DHL", countries: ["qa", "sa"], trackUrl: "https://www.dhl.com/global-en/home/tracking.html?tracking-id={code}" },
  { id: "fedex", ar: "فيديكس", en: "FedEx", countries: ["qa", "sa"], trackUrl: "https://www.fedex.com/fedextrack/?trknbr={code}" },
  { id: "qatar-post", ar: "بريد قطر", en: "Qatar Post", countries: ["qa"], trackUrl: "" },
  { id: "snoonu", ar: "سنونو", en: "Snoonu", countries: ["qa"], trackUrl: "" },
  { id: "rafeeq", ar: "رفيق", en: "Rafeeq", countries: ["qa"], trackUrl: "" },
  { id: "smsa", ar: "سمسا", en: "SMSA Express", countries: ["sa"], trackUrl: "https://www.smsaexpress.com/trackingdetails?tracknumbers={code}" },
  { id: "spl", ar: "البريد السعودي", en: "SPL", countries: ["sa"], trackUrl: "" },
  { id: "aymakan", ar: "أي مكان", en: "AyMakan", countries: ["sa"], trackUrl: "https://aymakan.com.sa/tracking/{code}" },
];

export function normalizeCourierId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

export function shapeCourier(body, existing = {}) {
  const preset = COURIER_PRESETS.find((p) => p.id === (body.id || existing.id));
  let fee = Number(body.fee ?? existing.fee) || 0;
  if (!Number.isFinite(fee) || fee < 0) fee = 0;
  fee = Math.min(99999, Math.floor(fee));
  const id = normalizeCourierId(body.id ?? existing.id) || `c-${Date.now().toString(36)}`;
  return {
    id,
    nameAr: String(body.nameAr ?? existing.nameAr ?? preset?.ar ?? "").trim().slice(0, 80),
    nameEn: String(body.nameEn ?? existing.nameEn ?? preset?.en ?? "").trim().slice(0, 80),
    active: (body.active !== undefined ? body.active : existing.active) === true,
    fee,
    etaAr: String(body.etaAr ?? existing.etaAr ?? "").trim().slice(0, 80),
    etaEn: String(body.etaEn ?? existing.etaEn ?? "").trim().slice(0, 80),
    phone: String(body.phone ?? existing.phone ?? "").trim().slice(0, 40),
    trackUrl: String(body.trackUrl ?? existing.trackUrl ?? preset?.trackUrl ?? "").trim().slice(0, 240),
  };
}

export function mergeCouriers(country, saved) {
  const code = country === "sa" ? "sa" : "qa";
  const savedList = Array.isArray(saved) ? saved : [];
  const byId = new Map();
  for (const row of savedList) {
    const id = normalizeCourierId(row.id);
    if (id) byId.set(id, row);
  }
  const out = [];
  for (const preset of COURIER_PRESETS.filter((p) => p.countries.includes(code))) {
    const savedRow = byId.get(preset.id) || {};
    out.push(
      shapeCourier({
        id: preset.id,
        nameAr: savedRow.nameAr || preset.ar,
        nameEn: savedRow.nameEn || preset.en,
        active: savedRow.active === true,
        fee: savedRow.fee,
        etaAr: savedRow.etaAr,
        etaEn: savedRow.etaEn,
        phone: savedRow.phone,
        trackUrl: savedRow.trackUrl || preset.trackUrl,
      }),
    );
    byId.delete(preset.id);
  }
  for (const extra of byId.values()) {
    const row = shapeCourier(extra);
    if (row.id && (row.nameAr || row.nameEn)) out.push(row);
  }
  return out;
}

export function activeCouriers(list) {
  return (list || []).filter((c) => c.active && c.id);
}

export function findCourier(list, id) {
  const key = normalizeCourierId(id);
  if (!key) return null;
  return (list || []).find((c) => c.id === key) || null;
}

export function trackingLink(courier, trackingNumber) {
  const url = String(courier?.trackUrl || "");
  const code = String(trackingNumber || "").trim();
  if (!url || !code) return "";
  if (!url.includes("{code}")) return url;
  return url.replaceAll("{code}", encodeURIComponent(code));
}
