/** Approximate road distance (km) from Rare Vet Lab — Al Muzahimiyah. */
const LAB_ORIGIN = 'المزاحمية';

const CITY_DISTANCES_KM = [
  { keys: ['المزاحمية', 'مزاحمية', 'muzahimiyah', 'al muzahimiyah', 'almuzahimiyah'], km: 0 },
  { keys: ['الرين', 'ar rayn', 'al rain', 'rain'], km: 18 },
  { keys: ['الحريق', 'harigh', 'al hariq'], km: 25 },
  { keys: ['رماح', 'rumah', 'ar rumah'], km: 28 },
  { keys: ['الدوادمي', 'duwadimi', 'ad duwadimi'], km: 90 },
  { keys: ['القويعية', 'quwayiyah', 'al quwayiyah'], km: 65 },
  { keys: ['شقراء', 'shaqra', 'ash shaqra'], km: 115 },
  { keys: ['الخرج', 'kharj', 'al kharj'], km: 85 },
  { keys: ['الرياض', 'riyadh', 'ar riyadh'], km: 48 },
  { keys: ['الدرعية', 'diriyah', 'ad diriyah'], km: 42 },
  { keys: ['الافلاج', 'aflaj', 'al aflaj'], km: 120 },
  { keys: ['وادي الدواسر', 'wadi ad dawasir'], km: 200 },
  { keys: ['الزلفي', 'zulfi', 'az zulfi'], km: 130 },
  { keys: ['المجمعة', 'majmaah', 'al majmaah'], km: 140 },
  { keys: ['حوطة بني تميم', 'hotat bani tamim'], km: 95 },
  { keys: ['السليل', 'sulayyil', 'as sulayyil'], km: 180 },
  { keys: ['عفيف', 'afif'], km: 110 },
  { keys: ['الدلم', 'dalm', 'ad dilam'], km: 70 },
  { keys: ['ثادق', 'thadiq'], km: 55 },
  { keys: ['مرات', 'marat'], km: 75 },
  { keys: ['الغاط', 'ghat', 'al ghat'], km: 100 },
  { keys: ['جلاجل', 'jalajil'], km: 125 },
  { keys: ['تمير', 'tumair'], km: 105 },
  { keys: ['روضة سدير', 'rawdat sudair'], km: 135 },
];

const normalizeCity = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[^\w\u0600-\u06FF\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const lookupCityDistanceKm = (city) => {
  const normalized = normalizeCity(city);
  if (!normalized) return null;

  for (const entry of CITY_DISTANCES_KM) {
    if (entry.keys.some((key) => {
      const nk = normalizeCity(key);
      return normalized === nk || normalized.includes(nk) || nk.includes(normalized);
    })) {
      return entry.km;
    }
  }
  return null;
};

const resolveCustomerDistanceKm = (customer) => {
  const city = customer?.city;
  const km = lookupCityDistanceKm(city);
  return {
    distance_km: km,
    city: city || null,
    lab_origin: LAB_ORIGIN,
    resolved: km != null,
  };
};

module.exports = {
  LAB_ORIGIN,
  lookupCityDistanceKm,
  resolveCustomerDistanceKm,
};
