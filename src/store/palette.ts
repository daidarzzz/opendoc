// Slice de la Command Palette (Ctrl/Cmd+K).
import { create } from "zustand";
import { searchDocs } from "../lib/commands";
import { dropTokens } from "../lib/paletteFilter";
import type { AppliedFilter, SearchResult } from "../lib/types";
import { useTabs } from "./tabs";

export const PALETTE_LIMIT = 20;

interface PaletteState {
  open: boolean;
  query: string;
  results: SearchResult[];
  applied: AppliedFilter[];
  unknown: string[];
  activeIndex: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  moveActive: (delta: number) => void;
  chooseActive: (opts?: { newTab?: boolean }) => void;
  /** Quita un filtro del texto (`cpp,py:x` − `py` → `cpp:x`). */
  removeFilter: (token: string) => void;
  /** Quita el último filtro (`cpp,py:x` → `cpp:x`; `cpp:x` → `x`). */
  removeLastFilter: () => void;
}

export const usePalette = create<PaletteState>()((set, get) => {
  let seq = 0;
  return {
    open: false,
    query: "",
    results: [],
    applied: [],
    unknown: [],
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
          set({
            results: res.results,
            applied: res.applied,
            unknown: res.unknown,
            activeIndex: 0,
          });
        } catch {
          if (mySeq !== seq) return;
          set({ results: [], applied: [], unknown: [] });
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
    removeFilter: (token: string) => {
      const next = dropTokens(get().query, (parts) =>
        parts.filter((p) => p.toLowerCase() !== token.toLowerCase()),
      );
      if (next !== null) get().setQuery(next);
    },
    removeLastFilter: () => {
      const next = dropTokens(get().query, (parts) => parts.slice(0, -1));
      if (next !== null) get().setQuery(next);
    },
  };
});
