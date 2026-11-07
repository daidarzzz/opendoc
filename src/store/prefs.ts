// Preferencias de interfaz (ver `lib/prefs.ts`). `reduceMotion` se aplica
// como clase en <html> al importar, para que no haya animación inicial.
import { create } from "zustand";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type UiPrefs } from "../lib/prefs";

function applyReduceMotion(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("reduce-motion", on);
}

interface PrefsState extends UiPrefs {
  set: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
  reset: () => void;
}

function pick(s: PrefsState): UiPrefs {
  return {
    smoothScroll: s.smoothScroll,
    linkPrefetch: s.linkPrefetch,
    reduceMotion: s.reduceMotion,
    paletteLimit: s.paletteLimit,
  };
}

const initial = loadPrefs();
applyReduceMotion(initial.reduceMotion);

export const usePrefs = create<PrefsState>()((set, get) => ({
  ...initial,
  set: (key, value) => {
    const next = { ...pick(get()), [key]: value };
    savePrefs(next);
    applyReduceMotion(next.reduceMotion);
    set({ [key]: value } as Partial<PrefsState>);
  },
  reset: () => {
    savePrefs(DEFAULT_PREFS);
    applyReduceMotion(DEFAULT_PREFS.reduceMotion);
    set({ ...DEFAULT_PREFS });
  },
}));
