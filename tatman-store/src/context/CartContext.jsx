import { createContext, useContext, useMemo, useState } from "react";
import { useCountry } from "./CountryContext";
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
  const { priceOf, country } = useCountry();

  const api = useMemo(() => {
    const count = items.reduce((sum, i) => sum + i.qty, 0);
    const total = items.reduce((sum, i) => sum + i.qty * priceOf(i.product), 0);

    return {
      items,
      count,
      total,
      add(product, qty = 1) {
        setItems((prev) => {
          const existing = prev.find((i) => i.product.id === product.id);
          const nextQty = capQty(product, (existing?.qty || 0) + qty, country);
          if (nextQty <= 0) {
            return prev.filter((i) => i.product.id !== product.id);
          }
          if (existing) {
            return prev.map((i) => (i.product.id === product.id ? { ...i, qty: nextQty } : i));
          }
          return [...prev, { product, qty: nextQty }];
        });
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

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
