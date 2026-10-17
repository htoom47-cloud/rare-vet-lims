import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { products as fallbackProducts } from "../data/products";
import { productAvailable } from "../data/countries";
import { useCountry } from "./CountryContext";

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const { country, setCountry, setCountries } = useCountry();
  const [products, setProducts] = useState(fallbackProducts);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .catalog(country)
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products || []);
        setSettings(data.settings);
        if (Array.isArray(data.countries) && data.countries.length) setCountries(data.countries);
        if (data.country && data.country !== country) setCountry(data.country);
      })
      .catch(() => {
        if (cancelled) return;
        setProducts(fallbackProducts.filter((p) => productAvailable(p, country)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country, setCountry, setCountries]);

  const value = useMemo(
    () => ({
      products,
      settings,
      loading,
      getProduct: (slug) => products.find((p) => p.slug === slug),
    }),
    [products, settings, loading],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
