import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("tatman-lang") || "ar");

  useEffect(() => {
    localStorage.setItem("tatman-lang", lang);
    document.documentElement.lang = lang === "ar" ? "ar" : "en";
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      isAr: lang === "ar",
      toggle: () => setLang((l) => (l === "ar" ? "en" : "ar")),
      setLang,
      t: (ar, en) => (lang === "ar" ? ar : en),
    }),
    [lang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
