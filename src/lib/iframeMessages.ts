// Validación de mensajes del iframe (contenido NO fiable: cualquier script
// del docset puede postear con formato válido). Todo es puro y testeable:
// el llamador además exige `event.source === iframe.contentWindow`.
// URLs canónicas de salida: `opendoc://<id>/<ruta>` (con `#ancla`).
export const MAX_NAV_URL_LEN = 4096;
export const MAX_TITLE_LEN = 200;
export const MAX_SCROLL_Y = 10_000_000;
/** Ventana para la tasa de teclas reenviadas. */
export const KEY_RATE_WINDOW_MS = 1000;
/** Máximo de teclas reenviadas por ventana (anti-bucle de un docset). */
export const KEY_RATE_MAX = 10;

const VIEWER_BASE = "http://opendoc.localhost/";
const SCHEME = "opendoc://";

export type IframeKey =
  | "w"
  | "tab"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "alt-left"
  | "alt-right";

export interface KeyPress {
  key: IframeKey;
  shift: boolean;
}

/** `http://opendoc.localhost/<id>/…` (Windows) → `opendoc://<id>/…`. */
export function toBackendUrl(href: string): string | null {
  if (href.startsWith(SCHEME)) return href;
  if (href.startsWith(VIEWER_BASE)) return SCHEME + href.slice(VIEWER_BASE.length);
  return null;
}

/** URL válida: esquema/host opendoc, longitud acotada, docset cargado. */
export function isValidNavUrl(backendUrl: string, docsetIds: readonly string[]): boolean {
  if (backendUrl.length === 0 || backendUrl.length > MAX_NAV_URL_LEN) return false;
  if (!backendUrl.startsWith(SCHEME)) return false;
  const rest = backendUrl.slice(SCHEME.length);
  if (rest === "" || rest.startsWith("/")) return false;
  const id = rest.split("/", 1)[0].split("#", 1)[0].split("?", 1)[0];
  return id !== "" && docsetIds.includes(id);
}

/** Título: texto ≤200 sin caracteres de control. Vacío → null. */
export function sanitizeTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001F\u007F]/g, "");
  const trimmed = clean.trim().slice(0, MAX_TITLE_LEN);
  return trimmed === "" ? null : trimmed;
}

/** scrollY: número finito en rango. Lo demás → null. */
export function sanitizeScrollY(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > MAX_SCROLL_Y) return null;
  return raw;
}

export interface ValidNav {
  url: string;
  title: string | null;
}

/**
 * Mensaje `opendoc-nav`. Null si: fuente no confiable, forma rota, URL
 * inválida. El título ausente/vacío es válido (se conserva el anterior).
 */
export function validateNavMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): ValidNav | null {
  if (!trustedSource) return null;
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec["type"] !== "opendoc-nav") return null;
  if (typeof rec["url"] !== "string") return null;
  const backend = toBackendUrl(rec["url"]);
  if (backend === null || !isValidNavUrl(backend, docsetIds)) return null;
  return { url: backend, title: sanitizeTitle(rec["title"]) };
}

/** Mensaje `opendoc-scroll`. Null si roto o fuera de rango. */
export function validateScrollMessage(
  data: unknown,
  trustedSource: boolean,
): { y: number } | null {
  if (!trustedSource) return null;
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec["type"] !== "opendoc-scroll") return null;
  const y = sanitizeScrollY(rec["y"]);
  return y === null ? null : { y };
}

function isIframeKey(raw: unknown): raw is IframeKey {
  return (
    raw === "w" ||
    raw === "tab" ||
    raw === "alt-left" ||
    raw === "alt-right" ||
    (typeof raw === "string" && raw.length === 1 && raw >= "1" && raw <= "9")
  );
}

/** Mensaje `opendoc-key`. Null si roto o tecla no reenviable. */
export function validateKeyMessage(
  data: unknown,
  trustedSource: boolean,
): KeyPress | null {
  if (!trustedSource) return null;
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec["type"] !== "opendoc-key") return null;
  if (!isIframeKey(rec["key"])) return null;
  return { key: rec["key"], shift: rec["shift"] === true };
}

/**
 * Tasa de teclas: como máximo KEY_RATE_MAX por ventana. Devuelve si pasa y
 * la lista podada (pura, testeable).
 */
export function keyRateAllow(times: number[], now: number): { allowed: boolean; times: number[] } {
  const recent = times.filter((t) => now - t < KEY_RATE_WINDOW_MS);
  if (recent.length >= KEY_RATE_MAX) return { allowed: false, times: recent };
  return { allowed: true, times: [...recent, now] };
}

/** Atajo del padre (ventana): tecla normalizada → acción. Puro, testeable. */
export type ParentShortcut =
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "tab-n"
  | "back"
  | "forward";

export interface MatchedShortcut {
  action: ParentShortcut;
  index?: number;
}

/**
 * Normaliza un KeyboardEvent del padre. Solo combinaciones exactas
 * (Ctrl/Cmd sin Alt salvo Alt+←/→); no choca con Ctrl+K ni con el webview
 * (WebView2 no usa estas teclas: sin pestañas ni chrome de navegador).
 */
export function matchParentShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): MatchedShortcut | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && !mod && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    return { action: e.key === "ArrowLeft" ? "back" : "forward" };
  }
  if (!mod || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "w" && !e.shiftKey) return { action: "close-tab" };
  if (k === "tab" && !e.shiftKey) return { action: "next-tab" };
  if (k === "tab" && e.shiftKey) return { action: "prev-tab" };
  if (k.length === 1 && k >= "1" && k <= "9" && !e.shiftKey) {
    return { action: "tab-n", index: Number(k) - 1 };
  }
  return null;
}
