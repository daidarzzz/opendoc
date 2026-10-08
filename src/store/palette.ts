// Slice de la Command Palette (Ctrl/Cmd+K).
import { create } from "zustand";
import { searchDocs } from "../lib/commands";
import type { SearchResult } from "../lib/types";
import { useTabs } from "./tabs";

export const PALETTE_LIMIT = 20;

interface PaletteState {
  open: boolean;
  query: string;
  results: SearchResult[];
  activeIndex: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  moveActive: (delta: number) => void;
  chooseActive: (opts?: { newTab?: boolean }) => void;
}

export const usePalette = create<PaletteState>()((set, get) => {
  let seq = 0;
  return {
    open: false,
    query: "",
    results: [],
    activeIndex: 0,
    setOpen: (open: boolean) => {
      set({ open });
      if (!open) set({ activeIndex: 0 });
    },
    toggle: () => {
      const open = !get().open;
      set({ open });
      if (!open) set({ activeIndex: 0 });
    },
    setQuery: (query: string) => {
      set({ query, activeIndex: 0 });
      const mySeq = ++seq;
      void (async () => {
        try {
          const res = await searchDocs(query, { limit: PALETTE_LIMIT });
          if (mySeq !== seq) return; // Obsoleta: se descarta.
          set({ results: res.results, activeIndex: 0 });
        } catch {
          if (mySeq !== seq) return;
          set({ results: [] });
        }
      })();
    },
    moveActive: (delta: number) => {
      const { results, activeIndex } = get();
      if (results.length === 0) return;
      const next =
        (activeIndex + delta + results.length) % results.length;
      set({ activeIndex: next });
    },
    chooseActive: (opts) => {
      const { results, activeIndex } = get();
      const chosen = results[activeIndex];
      if (!chosen) return;
      set({ open: false, activeIndex: 0 });
      void useTabs
        .getState()
        .openEntry(
          chosen.docset_id,
          { name: chosen.name, path: chosen.path },
          { newTab: opts?.newTab },
        );
    },
  };
});
