import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  FALLBACK_COUNTRIES,
  normalizeCountryCode,
  productPrice,
} from "../data/countries";

const CountryContext = createContext(null);

export function CountryProvider({ children }) {
  const [country, setCountryState] = useState(() => normalizeCountryCode(localStorage.getItem("tatman-country")) || "qa");
  const [countries, setCountriesState] = useState(FALLBACK_COUNTRIES);

  const setCountries = useCallback((next) => {
    if (!Array.isArray(next) || !next.length) return;
    setCountriesState(next);
  }, []);

  const setCountry = useCallback((next) => {
    const code = normalizeCountryCode(next) || "qa";
    localStorage.setItem("tatman-country", code);
    setCountryState(code);
  }, []);

  const value = useMemo(() => {
    const meta = countries.find((c) => c.code === country) || FALLBACK_COUNTRIES.find((c) => c.code === country) || FALLBACK_COUNTRIES[0];
    return {
      country,
      countries,
      isSa: country === "sa",
      setCountries,
      setCountry,
      priceOf(product) {
        return productPrice(product, country);
      },
      formatPrice(amount, lang) {
        const n = Number(amount) || 0;
        if (lang === "ar") return `${n} ${meta.currencyAr}`;
        return `${meta.currency} ${n}`;
      },
      countryName(lang) {
        return lang === "en" ? meta.nameEn : meta.nameAr;
      },
    };
  }, [country, countries, setCountries, setCountry]);

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error("useCountry must be used within CountryProvider");
  return ctx;
}
