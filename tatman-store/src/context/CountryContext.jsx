import { createContext, useContext, useMemo, useState } from "react";

const CountryContext = createContext(null);

export function CountryProvider({ children }) {
  const [country, setCountry] = useState(() => localStorage.getItem("tatman-country") || "qa");

  const value = useMemo(() => {
    const isSa = country === "sa";
    return {
      country,
      isSa,
      setCountry(next) {
        const code = next === "sa" ? "sa" : "qa";
        localStorage.setItem("tatman-country", code);
        setCountry(code);
      },
      priceOf(product) {
        if (!product) return 0;
        return isSa ? Number(product.priceSar || product.priceQar || 0) : Number(product.priceQar || 0);
      },
      formatPrice(amount, lang) {
        const n = Number(amount) || 0;
        if (isSa) return lang === "ar" ? `${n} ر.س` : `SAR ${n}`;
        return lang === "ar" ? `${n} ر.ق` : `QAR ${n}`;
      },
    };
  }, [country]);

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error("useCountry must be used within CountryProvider");
  return ctx;
}
