// Páginas favoritas (lógica pura, testeada). Solo frontend, en localStorage.
// A diferencia del historial, la clave es la URL completa CON ancla: en los
// docsets de página única el ancla es el símbolo que se quiere guardar.
// Tolerante: sin storage o con basura, lista vacía.
import { docsetOfUrl } from "./recent";
import type { StringStorage } from "./sidebar";

export interface FavoritePage {
  url: string;
  title: string;
  docsetId: string;
  /** Epoch en ms del momento en que se añadió. */
  at: number;
}

export const MAX_FAVORITES = 500;
const STORAGE_KEY = "opendoc.favorites";
const MAX_URL = 4096;
const MAX_TITLE = 200;

/** ¿Está esta URL (con ancla) entre los favoritos? */
export function isFavorite(list: readonly FavoritePage[], url: string): boolean {
  return list.some((f) => f.url === url);
}

/**
 * Añade un favorito al principio. Si ya existía no lo duplica: actualiza el
 * título (salvo que el nuevo sea provisional) y lo deja donde estaba.
 * Devuelve la lista sin cambios si la URL no es de un docset o es enorme.
 */
export function addFavorite(list: readonly FavoritePage[], url: string, title: string, now: number): FavoritePage[] {
  const docsetId = docsetOfUrl(url);
  if (!docsetId || url.length > MAX_URL) return [...list];
  const clean = title.trim().slice(0, MAX_TITLE);
  const provisional = clean === "" || clean === docsetId;
  const prev = list.find((f) => f.url === url);
  if (prev) {
    return list.map((f) => (f === prev ? { ...f, title: provisional ? f.title : clean } : f));
  }
  const next: FavoritePage = { url, title: clean || docsetId, docsetId, at: now };
  return [next, ...list].slice(0, MAX_FAVORITES);
}

export function removeFavorite(list: readonly FavoritePage[], url: string): FavoritePage[] {
  return list.filter((f) => f.url !== url);
}

/** Alterna: quita si estaba, añade si no. */
export function toggleFavorite(list: readonly FavoritePage[], url: string, title: string, now: number): FavoritePage[] {
  return isFavorite(list, url) ? removeFavorite(list, url) : addFavorite(list, url, title, now);
}

/** Normaliza datos arbitrarios del storage a una lista válida. */
export function normalizeFavorites(raw: unknown): FavoritePage[] {
  if (!Array.isArray(raw)) return [];
  const out: FavoritePage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const url = r["url"];
    const title = r["title"];
    const at = r["at"];
    if (typeof url !== "string" || typeof title !== "string" || typeof at !== "number" || !Number.isFinite(at)) continue;
    const docsetId = docsetOfUrl(url);
    if (!docsetId || url.length > MAX_URL || out.some((f) => f.url === url)) continue;
    out.push({ url, title: title.slice(0, MAX_TITLE), docsetId, at });
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export function loadFavoritesFrom(store: StringStorage | null | undefined): FavoritePage[] {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? normalizeFavorites(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveFavoritesTo(store: StringStorage | null | undefined, list: readonly FavoritePage[]): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sigue en memoria aunque no se pueda guardar.
  }
}

/** Filtra por texto (título, nombre del docset o URL), sin distinguir mayúsculas. */
export function filterFavorites(
  list: readonly FavoritePage[],
  query: string,
  docsetName: (id: string) => string,
): FavoritePage[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...list];
  return list.filter(
    (f) =>
      f.title.toLowerCase().includes(q) ||
      docsetName(f.docsetId).toLowerCase().includes(q) ||
      f.url.toLowerCase().includes(q),
  );
}
