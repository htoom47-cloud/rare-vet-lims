import { createContext, useContext, useMemo, useState } from "react";
import { WHATSAPP } from "../data/products";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const api = useMemo(() => {
    const count = items.reduce((sum, i) => sum + i.qty, 0);
    const total = items.reduce((sum, i) => sum + i.qty * i.product.priceQar, 0);

    return {
      items,
      count,
      total,
      add(product, qty = 1) {
        setItems((prev) => {
          const existing = prev.find((i) => i.product.id === product.id);
          if (existing) {
            return prev.map((i) =>
              i.product.id === product.id ? { ...i, qty: i.qty + qty } : i,
            );
          }
          return [...prev, { product, qty }];
        });
      },
      setQty(productId, qty) {
        setItems((prev) =>
          prev
            .map((i) => (i.product.id === productId ? { ...i, qty } : i))
            .filter((i) => i.qty > 0),
        );
      },
      remove(productId) {
        setItems((prev) => prev.filter((i) => i.product.id !== productId));
      },
      clear() {
        setItems([]);
      },
      whatsappCheckout(lang) {
        if (!items.length) return;
        const lines = items.map((i) => {
          const name = lang === "ar" ? i.product.nameAr : i.product.nameEn;
          return `• ${name} × ${i.qty}`;
        });
        const header =
          lang === "ar"
            ? "مرحباً تطمن، أريد طلب المنتجات التالية:"
            : "Hello Tatman, I would like to order:";
        const footer =
          lang === "ar"
            ? `\nالإجمالي التقريبي: ${total} ر.ق`
            : `\nApprox. total: QAR ${total}`;
        const text = encodeURIComponent([header, ...lines, footer].join("\n"));
        window.open(`https://wa.me/${WHATSAPP}?text=${text}`, "_blank");
      },
    };
  }, [items]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
