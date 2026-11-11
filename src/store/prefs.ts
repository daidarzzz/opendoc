// Preferencias de interfaz (ver `lib/prefs.ts`). `reduceMotion` (clase) y
// `design` (`data-design`) se aplican en <html> al importar: sin animación
// inicial ni parpadeo de estilo.
import { create } from "zustand";
import { applyDesign } from "../lib/design";
import { DEFAULT_PREFS, MAX_DOC_DARK_OFF, loadPrefs, savePrefs, type UiPrefs } from "../lib/prefs";

function applyReduceMotion(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("reduce-motion", on);
}

interface PrefsState extends UiPrefs {
  set: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
  /** Excluye (o vuelve a incluir) un docset del modo oscuro. */
  toggleDocDark: (docsetId: string) => void;
  reset: () => void;
}

function pick(s: PrefsState): UiPrefs {
  return {
    smoothScroll: s.smoothScroll,
    linkPrefetch: s.linkPrefetch,
    reduceMotion: s.reduceMotion,
    paletteLimit: s.paletteLimit,
    design: s.design,
    toc: s.toc,
    home: s.home,
    docDarkMode: s.docDarkMode,
    docDarkOff: s.docDarkOff,
  };
}

const initial = loadPrefs();
applyReduceMotion(initial.reduceMotion);
applyDesign(initial.design);

export const usePrefs = create<PrefsState>()((set, get) => ({
  ...initial,
  set: (key, value) => {
    const next = { ...pick(get()), [key]: value };
    savePrefs(next);
    applyReduceMotion(next.reduceMotion);
    applyDesign(next.design);
    set({ [key]: value } as Partial<PrefsState>);
  },
  toggleDocDark: (docsetId) => {
    const off = get().docDarkOff;
    const next = off.includes(docsetId)
      ? off.filter((id) => id !== docsetId)
      : [...off, docsetId].slice(-MAX_DOC_DARK_OFF);
    get().set("docDarkOff", next);
  },
  reset: () => {
    savePrefs(DEFAULT_PREFS);
    applyReduceMotion(DEFAULT_PREFS.reduceMotion);
    applyDesign(DEFAULT_PREFS.design);
    set({ ...DEFAULT_PREFS });
  },
}));
