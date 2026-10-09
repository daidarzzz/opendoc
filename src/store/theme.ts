// Tema (T9): el backend guarda el modo; aquí se aplica y se reacciona.
// - Anti-flash: al importar se aplica prefers-color-scheme de inmediato;
//   al llegar el valor guardado (init) se corrige si difiere.
// - Con System se reacciona en vivo a cambios del SO.
import { create } from "zustand";
import { getSettings, setTheme } from "../lib/commands";
import type { ThemeMode } from "../lib/types";

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyResolved(mode: ThemeMode): void {
  const resolved = mode === "system" ? systemTheme() : mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

interface ThemeState {
  mode: ThemeMode;
  loaded: boolean;
  init: () => Promise<void>;
  cycle: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

// Sin flash: sistema de inmediato; init() corrige con lo guardado.
applyResolved("system");

export const useTheme = create<ThemeState>()((set, get) => ({
  mode: "system",
  loaded: false,
  init: async () => {
    try {
      const settings = await getSettings();
      set({ mode: settings.theme, loaded: true });
      applyResolved(settings.theme);
    } catch {
      set({ loaded: true });
    }
  },
  cycle: async () => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(get().mode) + 1) % order.length] ?? "light";
    set({ mode: next });
    applyResolved(next);
    try {
      await setTheme(next);
    } catch {
      // Se conserva local; el backend persiste cuando puede.
    }
  },
  setMode: async (mode) => {
    set({ mode });
    applyResolved(mode);
    try {
      await setTheme(mode);
    } catch {
      // Se conserva local; el backend persiste cuando puede.
    }
  },
}));

// Reacción en vivo a cambios del sistema (solo en modo System).
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (useTheme.getState().mode === "system") {
      applyResolved("system");
    }
  });
