// Slice de navegación por tipos (origen: list_kinds/list_entries).
// Árbol docset -> tipos -> entradas con carga por páginas. Se invalida
// con reset() al recargar docsets, cambiar de carpeta o instalar un tarix
// (lo llama el slice de docsets).
import { create } from "zustand";
import { listEntries, listKinds } from "../lib/commands";
import type { KindInfo, NavEntry } from "../lib/types";

/** Tamaño de página de entradas (igual que el defecto del backend). */
export const BROWSE_PAGE = 100;

type KindsState = "loading" | "ready" | "error";

const entryKey = (docsetId: string, kind: string): string => `${docsetId}\n${kind}`;
const pageKey = (docsetId: string, kind: string, page: number): string =>
  `${entryKey(docsetId, kind)}\n${page}`;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : JSON.stringify(e);
}

interface BrowseState {
  kinds: Record<string, KindInfo[]>;
  kindsState: Record<string, KindsState>;
  kindsError: Record<string, string>;
  /** Entradas dispersas por docset+tipo (longitud = count; hueco = sin pedir). */
  entries: Record<string, (NavEntry | undefined)[]>;
  /** Páginas ya pedidas (con éxito) por docset+tipo+página. */
  loadedPages: Record<string, boolean>;
  /** Páginas en vuelo (no repetir la petición). */
  inflight: Record<string, boolean>;
  /** Error de la última página fallida por docset+tipo (reintento al pedir). */
  entriesError: Record<string, string>;
  expandedDocs: string[];
  expandedKinds: Record<string, string[]>;
  toggleDoc: (docsetId: string) => void;
  toggleKind: (docsetId: string, kind: string) => void;
  collapseAll: () => void;
  ensureKinds: (docsetId: string) => Promise<void>;
  ensureRange: (
    docsetId: string,
    kind: string,
    count: number,
    start: number,
    end: number,
  ) => Promise<void>;
  /** Reintenta las páginas visibles de un tipo tras un error. */
  retryEntries: (
    docsetId: string,
    kind: string,
    count: number,
    start: number,
    end: number,
  ) => Promise<void>;  /** Invalida todo (recarga de docsets, cambio de carpeta, tarix instalado). */
  reset: () => void;
}

export const useBrowse = create<BrowseState>()((set, get) => ({
  kinds: {},
  kindsState: {},
  kindsError: {},
  entries: {},
  loadedPages: {},
  inflight: {},
  entriesError: {},
  expandedDocs: [],
  expandedKinds: {},

  toggleDoc: (docsetId: string) => {
    const { expandedDocs } = get();
    if (expandedDocs.includes(docsetId)) {
      set({
        expandedDocs: expandedDocs.filter((d) => d !== docsetId),
      });
    } else {
      set({ expandedDocs: [...expandedDocs, docsetId] });
      void get().ensureKinds(docsetId);
    }
  },

  toggleKind: (docsetId: string, kind: string) => {
    const { expandedKinds } = get();
    const open = expandedKinds[docsetId] ?? [];
    if (open.includes(kind)) {
      set({
        expandedKinds: { ...expandedKinds, [docsetId]: open.filter((k) => k !== kind) },
      });
    } else {
      set({ expandedKinds: { ...expandedKinds, [docsetId]: [...open, kind] } });
      const info = get().kinds[docsetId]?.find((k) => k.kind === kind);
      if (info) {
        void get().ensureRange(docsetId, kind, info.count, 0, BROWSE_PAGE);
      }
    }
  },

  collapseAll: () => set({ expandedDocs: [], expandedKinds: {} }),

  ensureKinds: async (docsetId: string) => {
    const state = get().kindsState[docsetId];
    if (state === "loading" || state === "ready") return;
    set((s) => ({ kindsState: { ...s.kindsState, [docsetId]: "loading" } }));
    try {
      const kinds = await listKinds(docsetId);
      // Si hubo un reset mientras pedíamos, se descarta.
      if (get().kindsState[docsetId] !== "loading") return;
      const entries: Record<string, (NavEntry | undefined)[]> = {};
      for (const k of kinds) {
        entries[entryKey(docsetId, k.kind)] = new Array<NavEntry | undefined>(k.count);
      }
      set((s) => ({
        kinds: { ...s.kinds, [docsetId]: kinds },
        kindsState: { ...s.kindsState, [docsetId]: "ready" },
        kindsError: { ...s.kindsError, [docsetId]: "" },
        entries: { ...s.entries, ...entries },
      }));
    } catch (e) {
      if (get().kindsState[docsetId] !== "loading") return;
      set((s) => ({
        kindsState: { ...s.kindsState, [docsetId]: "error" },
        kindsError: { ...s.kindsError, [docsetId]: errText(e) },
      }));
    }
  },

  ensureRange: async (
    docsetId: string,
    kind: string,
    count: number,
    start: number,
    end: number,
  ) => {
    const key = entryKey(docsetId, kind);
    const from = Math.max(0, start);
    const to = Math.min(count, end);
    if (from >= to) return;
    const firstPage = Math.floor(from / BROWSE_PAGE);
    const lastPage = Math.floor((to - 1) / BROWSE_PAGE);
    for (let page = firstPage; page <= lastPage; page++) {
      const pk = pageKey(docsetId, kind, page);
      const s = get();
      if (s.loadedPages[pk] || s.inflight[pk]) continue;
      // Página ya completa en el array (p. ej. tras reintento parcial).
      const arr = s.entries[key];
      let complete = false;
      if (arr) {
        complete = true;
        const ps = page * BROWSE_PAGE;
        for (let i = ps; i < Math.min(ps + BROWSE_PAGE, count); i++) {
          if (arr[i] === undefined) {
            complete = false;
            break;
          }
        }
      }
      if (complete) {
        set((prev) => ({ loadedPages: { ...prev.loadedPages, [pk]: true } }));
        continue;
      }
      set((prev) => ({ inflight: { ...prev.inflight, [pk]: true } }));
      try {
        const offset = page * BROWSE_PAGE;
        const rows = await listEntries(docsetId, kind, offset, BROWSE_PAGE);
        // Reset durante la petición: se descarta.
        if (!get().kinds[docsetId]) return;
        set((prev) => {
          const next = (prev.entries[key] ?? []).slice();
          for (let i = 0; i < rows.length; i++) {
            next[offset + i] = rows[i];
          }
          const { [pk]: _drop, ...inflight } = prev.inflight;
          return {
            entries: { ...prev.entries, [key]: next },
            loadedPages: { ...prev.loadedPages, [pk]: true },
            inflight,
            entriesError: { ...prev.entriesError, [key]: "" },
          };
        });
      } catch (e) {
        if (!get().kinds[docsetId]) return;
        set((prev) => {
          const { [pk]: _drop, ...inflight } = prev.inflight;
          return {
            inflight,
            entriesError: { ...prev.entriesError, [key]: errText(e) },
          };
        });
      }
    }
  },

  retryEntries: async (docsetId, kind, count, start, end) => {
    const key = entryKey(docsetId, kind);
    set((s) => ({ entriesError: { ...s.entriesError, [key]: "" } }));
    await get().ensureRange(docsetId, kind, count, start, end);
  },

  reset: () =>
    set({
      kinds: {},
      kindsState: {},
      kindsError: {},
      entries: {},
      loadedPages: {},
      inflight: {},
      entriesError: {},
      expandedDocs: [],
      expandedKinds: {},
    }),
}));
