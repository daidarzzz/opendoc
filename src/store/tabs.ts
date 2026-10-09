// Slice de pestañas con historial propio (v0.2 V2-3).
// La lógica del historial es pura (lib/tabHistory); aquí solo orquesta:
// - el historial es una secuencia por pestaña con un cursor explícito;
//   los ecos del iframe actualizan título/ancla sin crear otra parada;
// - el iframe reporta navegación/scroll/teclas ya validadas por el Viewer;
// - solo la pestaña activa monta su iframe (las demás guardan URL+scroll).
// Sin persistencia entre sesiones (siguiente tarea).
import { create } from "zustand";
import { getDocsetHome } from "../lib/commands";
import { docsetEntryUrl, toViewerUrl } from "../lib/opendocUrl";
import { keyRateAllow } from "../lib/iframeMessages";
import type { IframeKey } from "../lib/iframeMessages";
import { OPEN_TAB_RATE_MAX, OPEN_TAB_RATE_WINDOW_MS, rateAllow } from "../lib/iframeMessages";
import {
  appendTab,
  closeTab as closeTabPure,
  currentEntry,
  emptyTab,
  goBack as goBackPure,
  goForward as goForwardPure,
  moveTab as moveTabPure,
  navigateTab,
  noteScroll,
  tabWithEntry,
} from "../lib/tabHistory";
import type { Tab } from "../lib/types";

export interface OpenOpts {
  /** Abrir en pestaña nueva en vez de la activa. */
  newTab?: boolean;
}

interface TabsState {
  tabs: Tab[];
  activeId: string;
  error: string;
  /** Teclas reenviadas recientes (tasa ≤10/s, anti-bucle de un docset). */
  keyTimes: number[];
  /** Peticiones open-tab recientes (tasa ≤3/s). */
  openTabTimes: number[];
  /** Últimas pestañas cerradas con contenido (máx. 10, para reabrir). */
  closed: Tab[];
  active: () => Tab | undefined;
  openEntry: (
    docsetId: string,
    entry: { name: string; path: string },
    opts?: OpenOpts,
  ) => Promise<void>;
  openHome: (docsetId: string, opts?: OpenOpts) => Promise<void>;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  /** Pestaña vacía nueva (bienvenida) y la activa. */
  newTab: () => void;
  moveTab: (id: string, to: number) => void;
  goBack: () => void;
  goForward: () => void;
  childNav: (url: string, title: string | null) => void;
  childScroll: (url: string, y: number) => void;
  childKey: (key: IframeKey, shift: boolean) => void;
  /**
   * Abre una URL validada en pestaña nueva (enlaces del documento).
   * Respeta la tasa (3/s) y el tope de 30 pestañas.
   */
  openTabUrl: (url: string, fallbackTitle: string) => void;
  /** Reabre la última pestaña cerrada con contenido (Ctrl+Shift+T). */
  reopenLast: () => void;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : JSON.stringify(e);
}

/** docsetId de una URL canónica `opendoc://<id>/…`. */
function docsetOf(url: string): string {
  return url.slice("opendoc://".length).split("/", 1)[0];
}

/** Cerradas guardadas para reabrir (Ctrl+Shift+T). */
const MAX_CLOSED = 10;

export const useTabs = create<TabsState>()((set, get) => {
  const fresh = emptyTab();
  return {
    tabs: [fresh],
    activeId: fresh.id,
    error: "",
    keyTimes: [],
    openTabTimes: [],
    closed: [],

    active: () => get().tabs.find((t) => t.id === get().activeId),

    openEntry: async (docsetId, entry, opts) => {
      try {
        const url = docsetEntryUrl(docsetId, entry.path);
        await toViewerUrl(url); // Valida el formato (lanza si no es opendoc://).
        const item = { url, title: entry.name };
        set((s) => {
          if (opts?.newTab) {
            const r = appendTab(s.tabs, s.activeId, {
              ...tabWithEntry(docsetId, item),
            });
            return { tabs: r.tabs, activeId: r.activeId, error: "" };
          }
          const tab = s.tabs.find((t) => t.id === s.activeId);
          if (!tab) return s;
          const next = { ...navigateTab(tab, item), docsetId };
          return {
            tabs: s.tabs.map((t) => (t.id === tab.id ? next : t)),
            error: "",
          };
        });
      } catch (e) {
        set({ error: errText(e) });
      }
    },

    openHome: async (docsetId, opts) => {
      try {
        const url = await getDocsetHome(docsetId);
        await toViewerUrl(url);
        // El título real lo confirma el iframe (document.title).
        const item = { url, title: docsetId };
        set((s) => {
          if (opts?.newTab) {
            const r = appendTab(s.tabs, s.activeId, {
              ...tabWithEntry(docsetId, item),
            });
            return { tabs: r.tabs, activeId: r.activeId, error: "" };
          }
          const tab = s.tabs.find((t) => t.id === s.activeId);
          if (!tab) return s;
          const next = { ...navigateTab(tab, item), docsetId };
          return {
            tabs: s.tabs.map((t) => (t.id === tab.id ? next : t)),
            error: "",
          };
        });
      } catch (e) {
        set({ error: errText(e) });
      }
    },

    activateTab: (id: string) => {
      if (get().tabs.some((t) => t.id === id)) set({ activeId: id });
    },

    closeTab: (id: string) => {
      const s = get();
      const closing = s.tabs.find((t) => t.id === id);
      const { tabs, activeId } = closeTabPure(s.tabs, s.activeId, id);
      const closed =
        closing && currentEntry(closing)
          ? [...s.closed, closing].slice(-MAX_CLOSED)
          : s.closed;
      set({ tabs, activeId, closed });
    },

    newTab: () => {
      const s = get();
      const r = appendTab(s.tabs, s.activeId, emptyTab());
      set({ tabs: r.tabs, activeId: r.activeId, error: "" });
    },

    moveTab: (id: string, to: number) => {
      set((s) => ({ tabs: moveTabPure(s.tabs, id, to) }));
    },

    goBack: () => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeId);
        if (!tab) return s;
        const next = goBackPure(tab);
        if (next === tab) return s;
        return {
          tabs: s.tabs.map((t) =>
            t.id === tab.id ? { ...next, docsetId: docsetOf(currentEntry(next)?.url ?? "") } : t,
          ),
        };
      });
    },

    goForward: () => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeId);
        if (!tab) return s;
        const next = goForwardPure(tab);
        if (next === tab) return s;
        return {
          tabs: s.tabs.map((t) =>
            t.id === tab.id ? { ...next, docsetId: docsetOf(currentEntry(next)?.url ?? "") } : t,
          ),
        };
      });
    },

    childNav: (url: string, title: string | null) => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeId);
        const current = tab ? currentEntry(tab) : null;
        if (!tab || !current) return s;
        const item = { url, title: title ?? current.title };
        const next = { ...navigateTab(tab, item), docsetId: docsetOf(url) };
        return { tabs: s.tabs.map((t) => (t.id === tab.id ? next : t)) };
      });
    },

    childScroll: (url: string, y: number) => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeId);
        if (!tab || currentEntry(tab)?.url !== url) return s;
        const next = noteScroll(tab, url, y);
        return { tabs: s.tabs.map((t) => (t.id === tab.id ? next : t)) };
      });
    },

    childKey: (key: IframeKey, shift: boolean) => {
      const now = Date.now();
      const { allowed, times } = keyRateAllow(get().keyTimes, now);
      set({ keyTimes: times });
      if (!allowed) return;
      const s = get();
      if (key === "w") {
        s.closeTab(s.activeId);
      } else if (key === "tab") {
        const idx = s.tabs.findIndex((t) => t.id === s.activeId);
        const next = shift
          ? s.tabs[(idx - 1 + s.tabs.length) % s.tabs.length]
          : s.tabs[(idx + 1) % s.tabs.length];
        if (next) s.activateTab(next.id);
      } else if (key === "alt-left") {
        s.goBack();
      } else if (key === "alt-right") {
        s.goForward();
      } else if (key === "mouse-back") {
        s.goBack();
      } else if (key === "mouse-forward") {
        s.goForward();
      } else {
        const idx = Number(key) - 1;
        const target = s.tabs[idx];
        if (target) s.activateTab(target.id);
      }
    },

    openTabUrl: (url: string, fallbackTitle: string) => {
      const now = Date.now();
      const { allowed, times } = rateAllow(
        get().openTabTimes,
        now,
        OPEN_TAB_RATE_MAX,
        OPEN_TAB_RATE_WINDOW_MS,
      );
      set({ openTabTimes: times });
      if (!allowed) return;
      const s = get();
      const r = appendTab(
        s.tabs,
        s.activeId,
        {
          ...tabWithEntry(docsetOf(url), { url, title: fallbackTitle }),
        },
      );
      set({ tabs: r.tabs, activeId: r.activeId, error: "" });
    },

    reopenLast: () => {
      const s = get();
      const last = s.closed[s.closed.length - 1];
      if (!last) return;
      const r = appendTab(
        s.tabs,
        s.activeId,
        last,
      );
      set({ tabs: r.tabs, activeId: r.activeId, closed: s.closed.slice(0, -1), error: "" });
    },
  };
});
