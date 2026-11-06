// Validación de mensajes del iframe (contenido NO fiable: cualquier script
// del docset puede postear con formato válido). Todo es puro y testeable:
// el llamador además exige `event.source === iframe.contentWindow`.
// URLs canónicas de salida: `opendoc://<id>/<ruta>` (con `#ancla`).
export const MAX_NAV_URL_LEN = 4096;
export const MAX_TITLE_LEN = 200;
export const MAX_SCROLL_Y = 10_000_000;
/** Ventana para la tasa de teclas reenviadas. */
export const KEY_RATE_WINDOW_MS = 1000;
/**
 * Máximo de teclas reenviadas por ventana (anti-bucle de un docset).
 * Holgado para no comerse la repetición por mantener pulsado (en macOS
 * ronda 20-30/s); el bucle malicioso sigue acotado.
 */
export const KEY_RATE_MAX = 25;
/** Ventana para abrir pestañas desde enlaces del documento. */
export const OPEN_TAB_RATE_WINDOW_MS = 1000;
/** Máximo de pestañas abiertas desde el documento por ventana. */
export const OPEN_TAB_RATE_MAX = 3;

const VIEWER_BASE = "http://opendoc.localhost/";
const SCHEME = "opendoc://";

export type IframeKey =
  | "w"
  | "t"
  | "k"
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
  | "alt-right"
  | "mouse-back"
  | "mouse-forward"
  | "f"
  | "find-close"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset";

/** Máximo de texto seleccionado que se acepta del menú contextual. */
export const MAX_SELECTION_LEN = 10_000;
/** Máximo de coincidencias que reporta la búsqueda en página. */
export const MAX_FIND_MATCHES = 2000;
/** Coordenadas del menú contextual: holgadas, pero acotadas. */
const MAX_COORD = 100_000;
/** Ventana y máximo de menús contextuales pedidos por el documento. */
export const CONTEXT_RATE_WINDOW_MS = 1000;
export const CONTEXT_RATE_MAX = 5;

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
 * Mensaje con URL (`opendoc-nav` / `opendoc-open-tab`). Null si: fuente no
 * confiable, forma rota, URL inválida. El título ausente/vacío es válido
 * (se conserva el anterior).
 */
function validateUrlMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
  expectedType: string,
): ValidNav | null {
  if (!trustedSource) return null;
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec["type"] !== expectedType) return null;
  if (typeof rec["url"] !== "string") return null;
  const backend = toBackendUrl(rec["url"]);
  if (backend === null || !isValidNavUrl(backend, docsetIds)) return null;
  return { url: backend, title: sanitizeTitle(rec["title"]) };
}

export function validateNavMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): ValidNav | null {
  return validateUrlMessage(data, trustedSource, docsetIds, "opendoc-nav");
}

/** Navegación interna solicitada antes del cambio de documento del iframe. */
export function validateNavigateMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): ValidNav | null {
  return validateUrlMessage(data, trustedSource, docsetIds, "opendoc-navigate");
}

/** Enlace interno que se puede preparar en el iframe secundario al pasar el ratón. */
export function validatePrefetchMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): { url: string } | null {
  const nav = validateUrlMessage(data, trustedSource, docsetIds, "opendoc-prefetch");
  return nav ? { url: nav.url } : null;
}

/** Página del iframe lista para el primer pintado (no espera imágenes ni load). */
export function validateReadyMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): ValidNav | null {
  return validateUrlMessage(data, trustedSource, docsetIds, "opendoc-ready");
}

/**
 * Petición de abrir enlace en pestaña nueva (`opendoc-open-tab`, desde
 * auxclick/Ctrl+clic en `<a>` internos). Misma validación que nav: SOLO
 * URLs opendoc de docsets cargados (las externas van al navegador por
 * on_navigation y nunca llegan aquí como pestaña).
 */
export function validateOpenTabMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): ValidNav | null {
  return validateUrlMessage(data, trustedSource, docsetIds, "opendoc-open-tab");
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
    raw === "t" ||
    raw === "k" ||
    raw === "tab" ||
    raw === "alt-left" ||
    raw === "alt-right" ||
    raw === "mouse-back" ||
    raw === "mouse-forward" ||
    raw === "f" ||
    raw === "find-close" ||
    raw === "zoom-in" ||
    raw === "zoom-out" ||
    raw === "zoom-reset" ||
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

export interface ContextRequest {
  /** Posición dentro del iframe (px CSS del documento hijo). */
  x: number;
  y: number;
  /** Texto seleccionado (sin controles salvo saltos/tabuladores), "" si nada. */
  selection: string;
  /** Enlace interno bajo el puntero (URL opendoc válida) o null. */
  link: string | null;
}

/** Selección: texto acotado, sin caracteres de control (salvo \t \n). */
export function sanitizeSelection(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return raw.slice(0, MAX_SELECTION_LEN).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

function coord(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (Math.abs(raw) > MAX_COORD) return null;
  return raw;
}

/**
 * Mensaje `opendoc-context` (clic derecho en el docset). Null si roto o
 * coordenadas fuera de rango. Un enlace inválido o de otro docset no anula
 * el menú: solo se descarta (`link: null`).
 */
export function validateContextMessage(
  data: unknown,
  trustedSource: boolean,
  docsetIds: readonly string[],
): ContextRequest | null {
  if (!trustedSource) return null;
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec["type"] !== "opendoc-context") return null;
  const x = coord(rec["x"]);
  const y = coord(rec["y"]);
  if (x === null || y === null) return null;
  let link: string | null = null;
  if (typeof rec["link"] === "string") {
    const backend = toBackendUrl(rec["link"]);
    if (backend !== null && isValidNavUrl(backend, docsetIds)) link = backend;
  }
  return { x, y, selection: sanitizeSelection(rec["selection"]), link };
}

/** Mensaje `opendoc-find-result`: enteros con 0 ≤ current ≤ total ≤ máximo. */
export function validateFindResultMessage(
  data: unknown,
  trustedSource: boolean,
): { total: number; current: number } | null {
  if (!trustedSource) return null;
  if (typeof data !== "object" || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec["type"] !== "opendoc-find-result") return null;
  const total = rec["total"];
  const current = rec["current"];
  if (!Number.isInteger(total) || !Number.isInteger(current)) return null;
  const tot = total as number;
  const cur = current as number;
  if (tot < 0 || tot > MAX_FIND_MATCHES || cur < 0 || cur > tot) return null;
  if (tot > 0 && cur === 0) return null;
  return { total: tot, current: cur };
}

/**
 * Tasa genérica: como máximo `max` eventos por ventana. Devuelve si pasa
 * y la lista podada (pura, testeable).
 */
export function rateAllow(
  times: number[],
  now: number,
  max: number,
  windowMs: number,
): { allowed: boolean; times: number[] } {
  const recent = times.filter((t) => now - t < windowMs);
  if (recent.length >= max) return { allowed: false, times: recent };
  return { allowed: true, times: [...recent, now] };
}

/** Tasa de teclas: como máximo KEY_RATE_MAX por ventana. */
export function keyRateAllow(times: number[], now: number): { allowed: boolean; times: number[] } {
  return rateAllow(times, now, KEY_RATE_MAX, KEY_RATE_WINDOW_MS);
}

/** Atajo del padre (ventana): tecla normalizada → acción. Puro, testeable. */
export type ParentShortcut =
  | "close-tab"
  | "new-tab"
  | "reopen-tab"
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
 * (sin chrome de navegador ni menú nativo con estas teclas).
 * Las letras y dígitos se leen de `code` (posición física, independiente
 * del layout: en cirílico/griego `key` no es "w"); sin `code` se usa `key`.
 */
export function matchParentShortcut(e: {
  key: string;
  code?: string;
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
  const k = keyFromCode(e.code) ?? e.key.toLowerCase();
  if (k === "w" && !e.shiftKey) return { action: "close-tab" };
  if (k === "t" && !e.shiftKey) return { action: "new-tab" };
  if (k === "t" && e.shiftKey) return { action: "reopen-tab" };
  if (k === "tab" && !e.shiftKey) return { action: "next-tab" };
  if (k === "tab" && e.shiftKey) return { action: "prev-tab" };
  if (k.length === 1 && k >= "1" && k <= "9" && !e.shiftKey) {
    return { action: "tab-n", index: Number(k) - 1 };
  }
  return null;
}

export type ViewerShortcut = "find" | "zoom-in" | "zoom-out" | "zoom-reset";

/**
 * Atajos del visor en el padre: Ctrl/Cmd+F (buscar en página) y
 * Ctrl/Cmd + `+`/`-`/`0` (zoom). Sin Alt. `+` también vale con Shift
 * (en muchos teclados es Shift+=).
 */
export function matchViewerShortcut(e: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): ViewerShortcut | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const code = e.code ?? "";
  if (code === "KeyF" || (code === "" && e.key.toLowerCase() === "f")) return e.shiftKey ? null : "find";
  if (code === "Equal" || code === "NumpadAdd" || e.key === "+" || e.key === "=") return "zoom-in";
  if (code === "Minus" || code === "NumpadSubtract" || e.key === "-") return "zoom-out";
  if ((code === "Digit0" || code === "Numpad0" || (code === "" && e.key === "0")) && !e.shiftKey) return "zoom-reset";
  return null;
}

/**
 * Letra/dígito por posición física (`KeyW`, `Digit1`…). Null si el código
 * no es uno de los nuestros (flechas y resto van por `key`).
 */
function keyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "KeyW") return "w";
  if (code === "KeyT") return "t";
  if (code === "Tab") return "tab";
  const digit = /^Digit([1-9])$/.exec(code) ?? /^Numpad([1-9])$/.exec(code);
  if (digit?.[1]) return digit[1];
  return null;
}
