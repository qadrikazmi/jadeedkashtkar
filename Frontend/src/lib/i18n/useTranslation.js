import { useAppStore } from "@/lib/store/useAppStore";
import { dictionary } from "./dictionary";

export function useTranslation() {
  const lang = useAppStore((s) => s.lang) || "en";
  const setLang = useAppStore((s) => s.setLang);

  const t = (key) => {
    const currentLang = dictionary[lang] ? lang : "en";
    return dictionary[currentLang]?.[key] || dictionary.en?.[key] || key;
  };

  return { 
    t, 
    lang, 
    setLang, 
    dir: lang === "ur" ? "rtl" : "ltr" 
  };
}