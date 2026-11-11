// Historial de lectura («Seguir leyendo», ver `lib/recent.ts`). Se alimenta
// solo: escucha la entrada actual de la pestaña activa (navegación y título
// confirmado por el iframe) y la registra. Persistido en localStorage.
import { create } from "zustand";
import { addRecent, loadRecentFrom, removeRecent, saveRecentTo, type RecentPage } from "../lib/recent";
import { currentEntry } from "../lib/tabHistory";
import { useTabs } from "./tabs";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

interface RecentState {
  pages: RecentPage[];
  record: (url: string, title: string) => void;
  remove: (url: string) => void;
  clear: () => void;
}

export const useRecent = create<RecentState>()((set, get) => ({
  pages: loadRecentFrom(storage()),
  record: (url, title) => {
    const pages = addRecent(get().pages, url, title, Date.now());
    saveRecentTo(storage(), pages);
    set({ pages });
  },
  remove: (url) => {
    const pages = removeRecent(get().pages, url);
    saveRecentTo(storage(), pages);
    set({ pages });
  },
  clear: () => {
    saveRecentTo(storage(), []);
    set({ pages: [] });
  },
}));

// Registro automático: cada cambio de página o de título en la pestaña activa.
let last = "";
useTabs.subscribe((s) => {
  const tab = s.tabs.find((t) => t.id === s.activeId);
  if (!tab || tab.type !== "docset") return;
  const entry = currentEntry(tab);
  if (!entry) return;
  const sig = `${entry.url}\n${entry.title}`;
  if (sig === last) return;
  last = sig;
  useRecent.getState().record(entry.url, entry.title);
});
