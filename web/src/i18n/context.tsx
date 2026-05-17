import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./en";
import fr from "./fr";
import nl from "./nl";
import type { Lang, Locale } from "./types";

const LOCALES: Record<Lang, Locale> = { en, fr, nl };

const STORAGE_KEY = "lang";

function detectInitial(): Lang {
  // URL > localStorage > navigator.language > en.
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl === "en" || fromUrl === "fr" || fromUrl === "nl") return fromUrl;
  } catch { /* */ }
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage === "en" || fromStorage === "fr" || fromStorage === "nl") return fromStorage;
  } catch { /* */ }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "").toLowerCase();
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("nl")) return "nl";
  return "en";
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Locale;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectInitial);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* */ }
  }, [lang]);

  const value: Ctx = { lang, setLang, t: LOCALES[lang] };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>");
  return ctx;
}
