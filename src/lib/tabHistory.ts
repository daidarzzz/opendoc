// Historial y pestañas como funciones puras (testeadas con Vitest).
// URLs canónicas `opendoc://<id>/<ruta>` (con `#ancla` si la hay).
import type { Tab, TabEntry } from "./types";

/** Máximo de páginas que conserva el historial de cada pestaña. */
export const MAX_HISTORY = 100;
/** Pestañas simultáneas. */
export const MAX_TABS = 30;
/** Scrolls guardados por pestaña. */
export const MAX_SCROLLS = 200;

let nextTabId = 1;

/** Pestaña vacía (bienvenida). */
export function emptyTab(): Tab {
  return {
    id: `tab-${nextTabId++}`,
    docsetId: "",
    history: [],
    historyIndex: -1,
    scrolls: {},
  };
}

/** Pestaña nueva con una entrada inicial. */
export function tabWithEntry(docsetId: string, entry: TabEntry): Tab {
  return { ...emptyTab(), docsetId, history: [entry], historyIndex: 0 };
}

/** Entrada actual de la pestaña, o null si es una pestaña vacía. */
export function currentEntry(tab: Tab): TabEntry | null {
  return tab.history[tab.historyIndex] ?? null;
}

export function canGoBack(tab: Tab): boolean {
  return tab.historyIndex > 0;
}

export function canGoForward(tab: Tab): boolean {
  return tab.historyIndex >= 0 && tab.historyIndex < tab.history.length - 1;
}

/** Misma página ignorando el hash (`a/b#f1` ~ `a/b#f2`, pero no ~ `a/b`). */
export function sameDocument(a: string, b: string): boolean {
  const pa = a.split("#", 1)[0];
  const pb = b.split("#", 1)[0];
  return pa === pb;
}

/**
 * Registra una navegación en la secuencia:
 * - URL idéntica → refresca la entrada actual, conservando el tramo futuro.
 * - Solo cambia el hash → sustituye la entrada actual y descarta el futuro.
 * - Otra URL → trunca el futuro y añade una parada (historial acotado).
 */
export function navigateTab(tab: Tab, entry: TabEntry): Tab {
  const current = currentEntry(tab);
  if (current && entry.url === current.url) {
    const history = [...tab.history];
    history[tab.historyIndex] = entry;
    return { ...tab, history };
  }
  if (current && sameDocument(current.url, entry.url)) {
    const history = tab.history.slice(0, tab.historyIndex + 1);
    history[tab.historyIndex] = entry;
    return { ...tab, history };
  }
  let history = [...tab.history.slice(0, tab.historyIndex + 1), entry];
  let historyIndex = history.length - 1;
  if (history.length > MAX_HISTORY) {
    const dropped = history.length - MAX_HISTORY;
    history = history.slice(dropped);
    historyIndex -= dropped;
  }
  return { ...tab, history, historyIndex };
}

/** Atrás: mueve el cursor una posición. Sin página anterior → igual. */
export function goBack(tab: Tab): Tab {
  return canGoBack(tab) ? { ...tab, historyIndex: tab.historyIndex - 1 } : tab;
}

/** Adelante: mueve el cursor una posición. Sin página siguiente → igual. */
export function goForward(tab: Tab): Tab {
  return canGoForward(tab) ? { ...tab, historyIndex: tab.historyIndex + 1 } : tab;
}

/** Guarda el scroll de una URL (acotado, evicción de la más antigua). */
export function noteScroll(tab: Tab, url: string, y: number): Tab {
  const scrolls = { ...tab.scrolls, [url]: y };
  const keys = Object.keys(scrolls);
  if (keys.length > MAX_SCROLLS) {
    for (const k of keys.slice(0, keys.length - MAX_SCROLLS)) {
      delete scrolls[k];
    }
  }
  return { ...tab, scrolls };
}

export interface CloseResult {
  tabs: Tab[];
  activeId: string;
}

/**
 * Cierra una pestaña. Activa la vecina derecha (o la izquierda si no hay).
 * Cerrar la última deja una vacía de bienvenida (nunca cero pestañas).
 */
export function closeTab(tabs: Tab[], activeId: string, id: string): CloseResult {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx < 0) return { tabs, activeId };
  if (tabs.length === 1) {
    const fresh = emptyTab();
    return { tabs: [fresh], activeId: fresh.id };
  }
  const rest = tabs.filter((t) => t.id !== id);
  let nextActive = activeId;
  if (activeId === id) {
    // Vecina derecha (ahora ocupa idx) o la última (izquierda).
    nextActive = rest[Math.min(idx, rest.length - 1)].id;
  }
  return { tabs: rest, activeId: nextActive };
}

/** Añade una pestaña (acota a MAX_TABS expulsando la inactiva más vieja). */
export function appendTab(tabs: Tab[], activeId: string, tab: Tab): CloseResult {
  let next = [...tabs, tab];
  if (next.length > MAX_TABS) {
    const victim = next.find((t) => t.id !== activeId) ?? next[0];
    next = next.filter((t) => t.id !== victim.id);
  }
  return { tabs: next, activeId: tab.id };
}

/** Mueve una pestaña de posición (reordenar). Fuera de rango → igual. */
export function moveTab(tabs: Tab[], id: string, to: number): Tab[] {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0 || to < 0 || to >= tabs.length || from === to) return tabs;
  const next = tabs.filter((t) => t.id !== id);
  next.splice(to, 0, tabs[from]);
  return next;
}
