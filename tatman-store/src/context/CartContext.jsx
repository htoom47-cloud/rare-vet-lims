import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useCountry } from "./CountryContext";
import { useLang } from "./LangContext";
import { stockOf } from "../data/stock";

const CartContext = createContext(null);

function capQty(product, qty, country) {
  const max = stockOf(product, country);
  const n = Math.max(0, Number(qty) || 0);
  if (max === null) return n;
  return Math.min(n, max);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState(null);
  const { priceOf, country } = useCountry();
  const { t } = useLang();

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  const api = useMemo(() => {
    const count = items.reduce((sum, i) => sum + i.qty, 0);
    const total = items.reduce((sum, i) => sum + i.qty * priceOf(i.product), 0);

    return {
      items,
      count,
      total,
      add(product, qty = 1) {
        const existing = items.find((i) => i.product.id === product.id);
        const nextQty = capQty(product, (existing?.qty || 0) + qty, country);
        if (nextQty <= 0 || nextQty <= (existing?.qty || 0)) return;
        setItems((prev) => {
          const row = prev.find((i) => i.product.id === product.id);
          if (row) {
            return prev.map((i) => (i.product.id === product.id ? { ...i, qty: nextQty } : i));
          }
          return [...prev, { product, qty: nextQty }];
        });
        setNotice({ id: Date.now() });
      },
      setQty(productId, qty) {
        setItems((prev) =>
          prev
            .map((i) => (i.product.id === productId ? { ...i, qty: capQty(i.product, qty, country) } : i))
            .filter((i) => i.qty > 0),
        );
      },
      remove(productId) {
        setItems((prev) => prev.filter((i) => i.product.id !== productId));
      },
      clear() {
        setItems([]);
      },
    };
  }, [items, priceOf, country]);

  return (
    <CartContext.Provider value={api}>
      {children}
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-20 z-[70] w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl bg-navy px-5 py-3 text-center text-sm font-extrabold text-white shadow-[0_12px_40px_rgba(26,61,58,0.35)]"
        >
          {t("تمت إضافة المنتج", "Product added")}
        </div>
      ) : null}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
