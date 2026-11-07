// Preferencias de interfaz (solo frontend, en localStorage). Tolerante:
// sin storage, JSON roto o valores fuera de rango → valores por defecto.
import type { StringStorage } from "./sidebar";

export const PALETTE_LIMITS = [20, 50, 100] as const;
export type PaletteLimit = (typeof PALETTE_LIMITS)[number];

export interface UiPrefs {
  /** Rueda del ratón animada dentro de los docsets. */
  smoothScroll: boolean;
  /** Precarga la página de un enlace al pasar el ratón por encima. */
  linkPrefetch: boolean;
  /** Desactiva animaciones y transiciones de la interfaz. */
  reduceMotion: boolean;
  /** Máximo de resultados de la paleta de búsqueda. */
  paletteLimit: PaletteLimit;
}

export const DEFAULT_PREFS: UiPrefs = {
  smoothScroll: true,
  linkPrefetch: true,
  reduceMotion: false,
  paletteLimit: 20,
};

const STORAGE_KEY = "opendoc.prefs";

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Normaliza un objeto arbitrario (p. ej. JSON del storage) a `UiPrefs`. */
export function normalizePrefs(raw: unknown): UiPrefs {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  const limit = PALETTE_LIMITS.find((l) => l === r["paletteLimit"]);
  return {
    smoothScroll: bool(r["smoothScroll"], DEFAULT_PREFS.smoothScroll),
    linkPrefetch: bool(r["linkPrefetch"], DEFAULT_PREFS.linkPrefetch),
    reduceMotion: bool(r["reduceMotion"], DEFAULT_PREFS.reduceMotion),
    paletteLimit: limit ?? DEFAULT_PREFS.paletteLimit,
  };
}

export function loadPrefsFrom(store: StringStorage | null | undefined): UiPrefs {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? normalizePrefs(JSON.parse(raw)) : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefsTo(store: StringStorage | null | undefined, prefs: UiPrefs): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Sigue activo en esta sesión aunque no se pueda guardar.
  }
}

function prefsStorage(): StringStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPrefs(): UiPrefs {
  return loadPrefsFrom(prefsStorage());
}

export function savePrefs(prefs: UiPrefs): void {
  savePrefsTo(prefsStorage(), prefs);
}
