// Tema claro/oscuro (clase `dark` de Tailwind).
// Persistencia en localStorage como interino; T9 la lleva al backend.
import { create } from "zustand";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "opendoc-theme";

function initial(): ThemeMode {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
  window.localStorage.setItem(STORAGE_KEY, mode);
}

interface ThemeState {
  mode: ThemeMode;
  toggle: () => void;
}

apply(initial());

export const useTheme = create<ThemeState>()((set) => ({
  mode: initial(),
  toggle: () =>
    set((s) => {
      const mode: ThemeMode = s.mode === "dark" ? "light" : "dark";
      apply(mode);
      return { mode };
    }),
}));
