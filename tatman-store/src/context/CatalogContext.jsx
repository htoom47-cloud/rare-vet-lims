import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { products as fallbackProducts } from "../data/products";
import { useCountry } from "./CountryContext";

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const { country } = useCountry();
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
      })
      .catch(() => {
        if (cancelled) return;
        setProducts(
          fallbackProducts.filter((p) => (country === "sa" ? p.availableSa !== false : p.availableQa !== false)),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country]);

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
