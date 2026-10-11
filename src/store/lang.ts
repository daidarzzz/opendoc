// Idioma de la interfaz (en/es, inglés por defecto, sin detectar el SO).
// - Anti-parpadeo: el inglés se aplica al importar i18n; al llegar el
//   valor guardado (init) se corrige si difiere. La App no pinta textos
//   hasta `loaded` (ver App.tsx).
// - `document.documentElement.lang` se actualiza en cada cambio.
import { create } from "zustand";
import { applyDocumentLang, normalizeLanguage } from "../lib/i18n";
import { getSettings, setLanguage } from "../lib/commands";
import type { Language } from "../lib/types";

interface LangState {
  lang: Language;
  loaded: boolean;
  init: () => Promise<void>;
  setLang: (lang: Language) => Promise<void>;
}

export const useLang = create<LangState>()((set) => ({
  lang: "en",
  loaded: false,
  init: async () => {
    try {
      const settings = await getSettings();
      const lang = normalizeLanguage(settings.language);
      set({ lang, loaded: true });
      applyDocumentLang(lang);
    } catch {
      set({ loaded: true });
    }
  },
  setLang: async (lang) => {
    set({ lang });
    applyDocumentLang(lang);
    try {
      await setLanguage(lang);
    } catch {
      // Se conserva local; el backend persiste cuando puede.
    }
  },
}));
