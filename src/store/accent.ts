// Acento de color (red/blue/amber/catppuccin, rojo por defecto).
// - Anti-parpadeo: el rojo se aplica al importar `lib/accent` (es el
//   valor por defecto del CSS); al llegar el valor guardado (init) se
//   corrige si difiere. Mismo patrón que tema e idioma.
import { create } from "zustand";
import { applyAccent, normalizeAccent } from "../lib/accent";
import { getSettings, setAccent } from "../lib/commands";
import type { Accent } from "../lib/types";

interface AccentState {
  accent: Accent;
  loaded: boolean;
  init: () => Promise<void>;
  setAccent: (accent: Accent) => Promise<void>;
}

export const useAccent = create<AccentState>()((set) => ({
  accent: "red",
  loaded: false,
  init: async () => {
    try {
      const settings = await getSettings();
      const accent = normalizeAccent(settings.accent);
      set({ accent, loaded: true });
      applyAccent(accent);
    } catch {
      set({ loaded: true });
    }
  },
  setAccent: async (accent) => {
    set({ accent });
    applyAccent(accent);
    try {
      await setAccent(accent);
    } catch {
      // Se conserva local; el backend persiste cuando puede.
    }
  },
}));
