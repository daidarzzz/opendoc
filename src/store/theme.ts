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

function applyResolved(mode: ThemeMode): "light" | "dark" {
  const resolved = mode === "system" ? systemTheme() : mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

interface ThemeState {
  mode: ThemeMode;
  /** Tema efectivo (System ya resuelto según el SO). */
  resolved: "light" | "dark";
  loaded: boolean;
  init: () => Promise<void>;
  cycle: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
}

// Sin flash: sistema de inmediato; init() corrige con lo guardado.
const initialResolved = applyResolved("system");

export const useTheme = create<ThemeState>()((set, get) => ({
  mode: "system",
  resolved: initialResolved,
  loaded: false,
  init: async () => {
    try {
      const settings = await getSettings();
      set({ mode: settings.theme, resolved: applyResolved(settings.theme), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  cycle: async () => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(get().mode) + 1) % order.length] ?? "light";
    set({ mode: next, resolved: applyResolved(next) });
    try {
      await setTheme(next);
    } catch {
      // Se conserva local; el backend persiste cuando puede.
    }
  },
  setMode: async (mode) => {
    set({ mode, resolved: applyResolved(mode) });
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
      useTheme.setState({ resolved: applyResolved("system") });
    }
  });
