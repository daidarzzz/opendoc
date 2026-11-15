// Favoritos (ver `lib/favorites.ts`). Persistido en localStorage.
import { create } from "zustand";
import {
  isFavorite,
  loadFavoritesFrom,
  removeFavorite,
  saveFavoritesTo,
  toggleFavorite,
  type FavoritePage,
} from "../lib/favorites";
import { currentEntry } from "../lib/tabHistory";
import { useTabs } from "./tabs";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

interface FavoritesState {
  pages: FavoritePage[];
  toggle: (url: string, title: string) => void;
  remove: (url: string) => void;
  clear: () => void;
}

export const useFavorites = create<FavoritesState>()((set, get) => ({
  pages: loadFavoritesFrom(storage()),
  toggle: (url, title) => {
    const pages = toggleFavorite(get().pages, url, title, Date.now());
    saveFavoritesTo(storage(), pages);
    set({ pages });
  },
  remove: (url) => {
    const pages = removeFavorite(get().pages, url);
    saveFavoritesTo(storage(), pages);
    set({ pages });
  },
  clear: () => {
    saveFavoritesTo(storage(), []);
    set({ pages: [] });
  },
}));

/** Página que muestra ahora la pestaña activa (null en inicio/catálogo). */
export function activePage(): { url: string; title: string } | null {
  const tab = useTabs.getState().active();
  if (!tab || tab.type !== "docset") return null;
  const entry = currentEntry(tab);
  return entry ? { url: entry.url, title: entry.title } : null;
}

/** Alterna el favorito de la página activa. Devuelve false si no hay página. */
export function toggleActiveFavorite(): boolean {
  const page = activePage();
  if (!page) return false;
  useFavorites.getState().toggle(page.url, page.title);
  return true;
}

export { isFavorite };
