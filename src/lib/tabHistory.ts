// Historial y pestañas como funciones puras (testeadas con Vitest).
// URLs canónicas `opendoc://<id>/<ruta>` (con `#ancla` si la hay).
import type { Tab, TabEntry } from "./types";

/** Entradas de historial por pestaña (pasado, sin contar la actual). */
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
    past: [],
    current: null,
    future: [],
    pendingUrl: null,
    scrolls: {},
  };
}

/** Pestaña nueva con una entrada inicial. */
export function tabWithEntry(docsetId: string, entry: TabEntry): Tab {
  return { ...emptyTab(), docsetId, current: entry };
}

/** Misma página ignorando el hash (`a/b#f1` ~ `a/b#f2`, pero no ~ `a/b`). */
export function sameDocument(a: string, b: string): boolean {
  const pa = a.split("#", 1)[0];
  const pb = b.split("#", 1)[0];
  return pa === pb;
}

/**
 * Nueva navegación en la pestaña:
 * - URL idéntica a la actual → solo refresca el título (eco load/hash).
 * - Solo cambia el hash → sustituye la actual (no apila anclas).
 * - En otro caso apila la actual en el pasado (acotado) y limpia el futuro.
 */
export function navigateTab(tab: Tab, entry: TabEntry): Tab {
  const current = tab.current;
  if (current && entry.url === current.url) {
    return { ...tab, current: entry };
  }
  if (current && sameDocument(current.url, entry.url)) {
    return { ...tab, current: entry, future: [] };
  }
  const past =
    current !== null ? [...tab.past, current].slice(-MAX_HISTORY) : tab.past;
  return { ...tab, past, current: entry, future: [] };
}

/** Atrás: la actual pasa al futuro. Sin pasado → igual. */
export function goBack(tab: Tab): Tab {
  if (tab.past.length === 0) return tab;
  const current = tab.current;
  const prev = tab.past[tab.past.length - 1];
  return {
    ...tab,
    past: tab.past.slice(0, -1),
    current: prev,
    future: current !== null ? [current, ...tab.future] : tab.future,
    pendingUrl: prev.url,
  };
}

/** Adelante: simétrico. Sin futuro → igual. */
export function goForward(tab: Tab): Tab {
  if (tab.future.length === 0) return tab;
  const [next, ...rest] = tab.future;
  const current = tab.current;
  return {
    ...tab,
    past: current !== null ? [...tab.past, current].slice(-MAX_HISTORY) : tab.past,
    current: next,
    future: rest,
    pendingUrl: next.url,
  };
}

/**
 * Eco del iframe tras una carga programática: si coincide con lo esperado,
 * se consume (no toca las pilas; el título ya viene actualizado).
 * Devuelve la pestaña y si se consumió.
 */
export function consumePending(tab: Tab, url: string): { tab: Tab; consumed: boolean } {
  if (tab.pendingUrl !== null && tab.pendingUrl === url) {
    return { tab: { ...tab, pendingUrl: null }, consumed: true };
  }
  return { tab, consumed: false };
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
