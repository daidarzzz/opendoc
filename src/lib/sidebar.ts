// Colapso del panel lateral: preferencia solo de UI, en localStorage
// (sin backend). Tolerante: sin storage o con basura, visible.
const STORAGE_KEY = "opendoc.sidebarCollapsed";

/** Mínimo que se usa de `Storage` (testeable con un fake en memoria). */
export interface StringStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function prefsStorage(): StringStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Lee el colapso desde un storage dado (`"1"` = oculto). */
export function loadSidebarCollapsedFrom(
  store: StringStorage | null | undefined,
): boolean {
  try {
    if (store == null) return false;
    return store.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Guarda el colapso en un storage dado (nunca lanza). */
export function saveSidebarCollapsedTo(
  store: StringStorage | null | undefined,
  collapsed: boolean,
): void {
  try {
    store?.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // El ajuste sigue activo esta sesión aunque el storage falle.
  }
}

/** Lee el colapso del localStorage (visible si falla). */
export function loadSidebarCollapsed(): boolean {
  return loadSidebarCollapsedFrom(prefsStorage());
}

/** Guarda el colapso en el localStorage (nunca lanza). */
export function saveSidebarCollapsed(collapsed: boolean): void {
  saveSidebarCollapsedTo(prefsStorage(), collapsed);
}
