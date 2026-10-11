// Sesión de pestañas: forma neutra, recorte y reencuentro (puro, Vitest).
// La forma neutra es `docsetId` + ruta relativa a Documents/ con ancla:
// nada de `opendoc://` ni `http://opendoc.localhost` en disco (la URL del
// iframe se reconstruye al restaurar). Los validadores de título/scroll
// se reutilizan de iframeMessages (no se duplican); la forma de id/ruta
// espeja las reglas del backend (session::, que a su vez espeja el
// protocolo: sin `..`, sin absolutas, sin `C:`, con `%XX` decodificado).
import {
  MAX_NAV_URL_LEN,
  sanitizeScrollY,
  sanitizeTitle,
} from "./iframeMessages";
import { currentEntry, emptyTab } from "./tabHistory";
import type {
  Docset,
  PendingTarix,
  SavedEntry,
  SavedTab,
  SessionData,
  Tab,
} from "./types";

/** Versión del formato que escribimos (session::SESSION_VERSION). */
export const SESSION_VERSION = 1;
/** Pestañas en disco (30 en memoria). */
export const MAX_SESSION_TABS = 30;
/** Entradas por pestaña en disco (100 en memoria). */
export const MAX_SESSION_HISTORY = 50;
/** Longitud máxima de ids y pistas, en caracteres. */
export const MAX_ID_LEN = 200;

const SCHEME = "opendoc://";

/** Slug de docset válido (`""` = bienvenida). */
export function isValidDocsetId(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw === "") return false;
  if (raw.length > MAX_ID_LEN || raw === "." || raw === "..") return false;
  for (const c of raw) {
    if (c === "/" || c === "\\" || c === "?" || c === "#" || c === ":" || c === "\0") return false;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F]/.test(c)) return false;
  }
  return true;
}

/** Una ronda de decodificación `%XX` (hex insensible a mayúsculas). */
function percentDecodeOnce(s: string): string {
  return s.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/** Decodifica `%XX` repetidamente hasta estabilizar (máx 5 rondas). */
function percentDecodeRepeated(raw: string): string {
  let current = raw;
  for (let i = 0; i < 5; i++) {
    const next = percentDecodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Ruta relativa válida (con ancla `?`/`#` permitidas, sin `..`). */
export function isValidRelPath(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length === 0 || raw.length > MAX_NAV_URL_LEN) return false;
  if (raw.includes("\0") || raw.includes("://") || raw.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return false;
  const withoutMarks = raw.split(/[?#]/, 1)[0] ?? raw;
  const decoded = percentDecodeRepeated(withoutMarks);
  if (decoded.includes("\0")) return false;
  if (/^[A-Za-z]:/.test(decoded) || decoded.startsWith("/")) return false;
  let segments = 0;
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return false;
    segments += 1;
  }
  return segments > 0;
}

/** URL canónica → forma neutra. Null si no tiene forma válida. */
export function toNeutral(url: string): { docsetId: string; rel: string } | null {
  if (!url.startsWith(SCHEME) || url.length > MAX_NAV_URL_LEN) return null;
  const rest = url.slice(SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const docsetId = rest.slice(0, slash);
  const rel = rest.slice(slash + 1);
  if (!isValidDocsetId(docsetId) || !isValidRelPath(rel)) return null;
  return { docsetId, rel };
}

/** Forma neutra → URL canónica. Null si no tiene forma válida. */
export function fromNeutral(docsetId: string, rel: string): string | null {
  if (!isValidDocsetId(docsetId) || !isValidRelPath(rel)) return null;
  const url = `${SCHEME}${docsetId}/${rel}`;
  return url.length > MAX_NAV_URL_LEN ? null : url;
}

/**
 * Recorta a `max` con ventana centrada en el índice actual (nunca pierde
 * la entrada actual) y ajusta el índice. Idempotente si ya cabe.
 */
export function trimHistoryWindow<T>(history: T[], index: number, max: number): { history: T[]; index: number } {
  if (max <= 0 || history.length <= max) {
    return { history, index: Math.min(index, history.length - 1) };
  }
  const at = Math.min(Math.max(index, 0), history.length - 1);
  const start = Math.min(Math.max(at - Math.floor(max / 2), 0), history.length - max);
  return { history: history.slice(start, start + max), index: at - start };
}

/** Nombre de la carpeta del docset (`…/Python.docset` → `Python`). */
export function folderNameOf(docset: { root_path: string }): string {
  const parts = docset.root_path.split(/[/\\]/).filter((p) => p !== "");
  const last = parts[parts.length - 1] ?? "";
  return last.replace(/\.docset$/i, "");
}

export type ResolveStatus = "ok" | "pending" | "missing";

export interface StoredHints {
  id: unknown;
  name: unknown;
  bundleId: unknown;
}

/**
 * Reencuentra el docset entre los cargados. Orden: id exacto, `bundle_id`
 * único, nombre de carpeta único (insensible a mayúsculas). Con
 * ambigüedad no se adivina: `missing` sin reescribir nada. Un tarix
 * pendiente cuenta como `pending` (existe pero sin instalar).
 */
export function resolveDocset(
  stored: StoredHints,
  docsets: Docset[],
  pendingIds: string[],
): { status: ResolveStatus; id: string } {
  const id = typeof stored.id === "string" ? stored.id : "";
  if (id !== "" && docsets.some((d) => d.id === id)) {
    return { status: "ok", id };
  }
  const bundle = typeof stored.bundleId === "string" && stored.bundleId !== "" ? stored.bundleId : null;
  if (bundle !== null) {
    const matches = docsets.filter((d) => d.bundle_id === bundle);
    if (matches.length === 1 && matches[0] !== undefined) {
      return { status: "ok", id: matches[0].id };
    }
  }
  const name = typeof stored.name === "string" && stored.name !== "" ? stored.name.toLowerCase() : null;
  if (name !== null) {
    const matches = docsets.filter((d) => folderNameOf(d).toLowerCase() === name);
    if (matches.length === 1 && matches[0] !== undefined) {
      return { status: "ok", id: matches[0].id };
    }
  }
  if (id !== "" && pendingIds.includes(id)) {
    return { status: "pending", id };
  }
  return { status: "missing", id };
}

/** Pestañas vivas → sesión guardable (sin bienvenidas vacías). */
export function tabsToSession(tabs: Tab[], activeId: string, docsets: Docset[]): SessionData {
  const meta = new Map(docsets.map((d) => [d.id, d]));
  const saved: SavedTab[] = [];
  let activePos = -1;
  for (const t of tabs) {
    const current = currentEntry(t);
    if (!current) continue;
    const kept: SavedEntry[] = [];
    let currentKept = -1;
    for (const e of t.history) {
      const n = toNeutral(e.url);
      if (!n) continue;
      if (e.url === current.url) currentKept = kept.length;
      kept.push({ path: n.rel, title: sanitizeTitle(e.title) ?? n.rel });
    }
    if (kept.length === 0) continue;
    if (currentKept < 0) currentKept = kept.length - 1;
    const { history, index } = trimHistoryWindow(kept, currentKept, MAX_SESSION_HISTORY);
    if (t.id === activeId) activePos = saved.length;
    const d = meta.get(t.docsetId);
    const scrollRaw = t.scrolls[current.url];
    const scroll = scrollRaw === undefined ? null : sanitizeScrollY(scrollRaw);
    saved.push({
      docset_id: t.docsetId,
      docset_name: d ? folderNameOf(d) : undefined,
      bundle_id: d?.bundle_id ?? undefined,
      history,
      history_index: index,
      scroll: scroll ?? undefined,
    });
  }
  // Tope 30: primeras 30, y la activa si quedó fuera.
  let active = activePos >= 0 ? activePos : saved.length - 1;
  if (saved.length > MAX_SESSION_TABS) {
    if (active >= MAX_SESSION_TABS) {
      const rescued = saved[active];
      saved.length = MAX_SESSION_TABS - 1;
      if (rescued !== undefined) saved.push(rescued);
      active = MAX_SESSION_TABS - 1;
    } else {
      saved.length = MAX_SESSION_TABS;
    }
  }
  if (saved.length === 0) return { version: SESSION_VERSION, tabs: [], active: 0 };
  if (active < 0 || active >= saved.length) active = saved.length - 1;
  return { version: SESSION_VERSION, tabs: saved, active };
}

export interface RestoredSession {
  tabs: Tab[];
  activeId: string;
}

/**
 * Sesión guardada → pestañas vivas. Las ausentes conservan su id y pistas
 * tal cual (se reescriben igual al guardar); si una pista reencuentra el
 * docset, el id se actualiza (y el próximo guardado lo persiste).
 */
export function sessionToTabs(
  data: SessionData,
  docsets: Docset[],
  pending: PendingTarix[],
): RestoredSession {
  const pendingIds = pending.map((p) => p.id);
  const tabs: Tab[] = [];
  const rawTabs = Array.isArray(data.tabs) ? data.tabs : [];
  for (const s of rawTabs) {
    if (typeof s !== "object" || s === null) continue;
    const rawHistory = Array.isArray(s.history) ? s.history : [];
    if (rawHistory.length === 0) continue;
    const resolved = resolveDocset(
      { id: s.docset_id, name: s.docset_name ?? null, bundleId: s.bundle_id ?? null },
      docsets,
      pendingIds,
    );
    const finalId = resolved.status === "ok" ? resolved.id : typeof s.docset_id === "string" ? s.docset_id : "";
    if (finalId === "") continue;
    const entries: { url: string; title: string }[] = [];
    let currentKept = -1;
    rawHistory.forEach((h, i) => {
      if (typeof h !== "object" || h === null) return;
      const rel = typeof h.path === "string" ? h.path : "";
      const url = fromNeutral(finalId, rel);
      if (!url) return;
      if (i === (typeof s.history_index === "number" ? s.history_index : -1)) currentKept = entries.length;
      entries.push({ url, title: sanitizeTitle(h.title) ?? rel });
    });
    if (entries.length === 0) continue;
    if (currentKept < 0) currentKept = entries.length - 1;
    const { history, index } = trimHistoryWindow(entries, currentKept, MAX_SESSION_HISTORY);
    const current = history[index];
    const scrolls: Record<string, number> = {};
    const scroll = sanitizeScrollY(s.scroll);
    if (current !== undefined && scroll !== null) scrolls[current.url] = scroll;
    tabs.push({ ...emptyTab(), docsetId: finalId, history, historyIndex: index, scrolls });
  }
  if (tabs.length === 0) {
    const welcome = emptyTab();
    return { tabs: [welcome], activeId: welcome.id };
  }
  const activePos = typeof data.active === "number" && data.active >= 0 && data.active < tabs.length
    ? data.active
    : tabs.length - 1;
  const activeTab = tabs[activePos];
  return { tabs, activeId: activeTab !== undefined ? activeTab.id : tabs[0]?.id ?? "" };
}
