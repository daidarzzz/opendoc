// Historial de lectura para «Seguir leyendo» (lógica pura, testeada).
// Solo frontend, en localStorage. Una entrada por URL canónica
// (`opendoc://<id>/<ruta>`, sin ancla): volver a una página la sube arriba
// y actualiza su título. Tolerante: sin storage o con basura, vacío.
import type { StringStorage } from "./sidebar";

export interface RecentPage {
  url: string;
  title: string;
  docsetId: string;
  /** Epoch en ms de la última visita. */
  at: number;
}

export const MAX_RECENT = 200;
const STORAGE_KEY = "opendoc.recent";
const MAX_URL = 4096;
const MAX_TITLE = 200;

/** URL sin `#ancla` (el ancla no cambia de página). */
export function pageKey(url: string): string {
  const hash = url.indexOf("#");
  return hash >= 0 ? url.slice(0, hash) : url;
}

/** docsetId de una URL `opendoc://<id>/…` (null si no lo es). */
export function docsetOfUrl(url: string): string | null {
  if (!url.startsWith("opendoc://")) return null;
  const id = url.slice("opendoc://".length).split("/", 1)[0] ?? "";
  return id === "" ? null : id;
}

/**
 * Añade una visita: la página queda la primera, sin duplicados (por URL
 * sin ancla) y la lista acotada. Un título vacío o igual al id del docset
 * (provisional, antes de que el iframe confirme el suyo) no pisa uno bueno.
 */
export function addRecent(list: readonly RecentPage[], url: string, title: string, now: number): RecentPage[] {
  const docsetId = docsetOfUrl(url);
  if (!docsetId || url.length > MAX_URL) return [...list];
  const key = pageKey(url);
  const prev = list.find((p) => p.url === key);
  const clean = title.trim().slice(0, MAX_TITLE);
  const provisional = clean === "" || clean === docsetId;
  const next: RecentPage = {
    url: key,
    title: provisional && prev ? prev.title : clean || docsetId,
    docsetId,
    at: now,
  };
  return [next, ...list.filter((p) => p.url !== key)].slice(0, MAX_RECENT);
}

/** Normaliza datos arbitrarios del storage a una lista válida. */
export function normalizeRecent(raw: unknown): RecentPage[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentPage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const url = r["url"];
    const title = r["title"];
    const at = r["at"];
    if (typeof url !== "string" || typeof title !== "string" || typeof at !== "number" || !Number.isFinite(at)) continue;
    const docsetId = docsetOfUrl(url);
    if (!docsetId || url.length > MAX_URL || out.some((p) => p.url === url)) continue;
    out.push({ url, title: title.slice(0, MAX_TITLE), docsetId, at });
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

export function loadRecentFrom(store: StringStorage | null | undefined): RecentPage[] {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? normalizeRecent(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveRecentTo(store: StringStorage | null | undefined, list: readonly RecentPage[]): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sigue en memoria aunque no se pueda guardar.
  }
}

/** Unidad y valor para `Intl.RelativeTimeFormat` (hace 3 min, hace 2 h…). */
export function relativeParts(at: number, now: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const s = Math.round((at - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return { value: 0, unit: "minute" };
  if (abs < 3600) return { value: Math.round(s / 60), unit: "minute" };
  if (abs < 86_400) return { value: Math.round(s / 3600), unit: "hour" };
  if (abs < 86_400 * 7) return { value: Math.round(s / 86_400), unit: "day" };
  return { value: Math.round(s / (86_400 * 7)), unit: "week" };
}

/** Grupo de días del historial. */
export type DayGroup = "today" | "yesterday" | "week" | "older";

/** Inicio (00:00 local) del día de `t`. */
function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Agrupa por día (hoy, ayer, últimos 7 días, anteriores) respetando el
 * orden de entrada (la más reciente primero). Omite los grupos vacíos.
 */
export function groupByDay(pages: readonly RecentPage[], now: number): { group: DayGroup; pages: RecentPage[] }[] {
  const today = startOfDay(now);
  const DAY = 86_400_000;
  const out: Record<DayGroup, RecentPage[]> = { today: [], yesterday: [], week: [], older: [] };
  for (const p of pages) {
    const g: DayGroup = p.at >= today ? "today" : p.at >= today - DAY ? "yesterday" : p.at >= today - 6 * DAY ? "week" : "older";
    out[g].push(p);
  }
  return (["today", "yesterday", "week", "older"] as const)
    .filter((g) => out[g].length > 0)
    .map((g) => ({ group: g, pages: out[g] }));
}

/** Filtra por texto (título, nombre del docset o URL), sin distinguir mayúsculas. */
export function filterRecent(
  pages: readonly RecentPage[],
  query: string,
  docsetName: (id: string) => string,
): RecentPage[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...pages];
  return pages.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      docsetName(p.docsetId).toLowerCase().includes(q) ||
      p.url.toLowerCase().includes(q),
  );
}

/** Quita una página (por URL sin ancla). */
export function removeRecent(pages: readonly RecentPage[], url: string): RecentPage[] {
  const key = pageKey(url);
  return pages.filter((p) => p.url !== key);
}
