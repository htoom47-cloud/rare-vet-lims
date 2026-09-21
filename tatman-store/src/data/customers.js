import { countryLabel, isCountryCode, normalizeCountryCode } from "./countries.js";

export function normalizePhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function orderCountry(code) {
  const n = normalizeCountryCode(code);
  return isCountryCode(n) ? n : "qa";
}

export function customersFromOrders(orders) {
  const map = new Map();
  for (const o of orders || []) {
    const digits = normalizePhone(o.customer?.phone);
    if (!digits) continue;
    const country = orderCountry(o.country);
    const name = String(o.customer?.name || "").trim();
    const phone = String(o.customer?.phone || "").trim();
    const created = String(o.createdAt || "");
    const row = map.get(digits);
    if (!row) {
      map.set(digits, {
        id: digits,
        name,
        phone,
        countries: [country],
        orderCount: 1,
        lastOrderAt: created,
      });
      continue;
    }
    row.orderCount += 1;
    if (!row.countries.includes(country)) row.countries.push(country);
    if (created >= row.lastOrderAt) {
      row.lastOrderAt = created;
      if (name) row.name = name;
      if (phone) row.phone = phone;
    }
  }
  return [...map.values()].sort((a, b) => String(b.lastOrderAt).localeCompare(String(a.lastOrderAt)));
}

export function countriesLabel(countries, settings) {
  return (countries || []).map((code) => countryLabel(code, settings)).join(" / ");
}
