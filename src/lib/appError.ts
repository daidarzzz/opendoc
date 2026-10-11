// Errores hacia la UI: el backend devuelve códigos estables (`kind` de
// `ApiError`); aquí se traducen. Los datos (id, path, message) nunca se
// traducen: viajan tal cual al detalle técnico.
// - Conocido → título traducido con sus datos + detalle técnico.
// - Desconocido → título genérico traducido + detalle técnico en bruto.
// El detalle se muestra en un <details> (ver ErrorDetails), nunca mezclado
// como texto principal en otro idioma.
import { t } from "./i18n";
import type { Language } from "./types";

/** Error normalizado para pintar: código + datos + detalle técnico. */
export interface AppErrorInfo {
  kind: string;
  /** Datos sin traducir (id, path, message…), para las plantillas. */
  params: Record<string, string>;
  /** Línea técnica en bruto para el desplegable. */
  detail: string;
}

/** `kind` de un ApiError, o "" si no tiene forma de error de comando. */
export function errorKindOf(e: unknown): string {
  if (typeof e === "object" && e !== null && "kind" in e) {
    const kind: unknown = (e as { kind: unknown }).kind;
    return typeof kind === "string" ? kind : "";
  }
  return "";
}

function strField(e: Record<string, unknown>, name: string): string {
  const v: unknown = e[name];
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Extrae el error a código + datos + detalle (puro, testeable). */
export function toAppError(e: unknown): AppErrorInfo | null {
  if (e === null || e === undefined || e === "") return null;
  const kind = errorKindOf(e);
  if (kind !== "" && typeof e === "object" && e !== null) {
    const rec = e as Record<string, unknown>;
    const params: Record<string, string> = {};
    for (const name of ["id", "path", "message", "status", "url"]) {
      const v = strField(rec, name);
      if (v !== "") params[name] = v;
    }
    if ("candidates" in rec && Array.isArray(rec["candidates"])) {
      params["candidates"] = (rec["candidates"] as unknown[]).join(", ");
    }
    const detail = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    return { kind, params, detail };
  }
  if (e instanceof Error) return { kind: "unknown", params: {}, detail: e.message };
  try {
    return { kind: "unknown", params: {}, detail: JSON.stringify(e) };
  } catch {
    return { kind: "unknown", params: {}, detail: String(e) };
  }
}

/** Título traducido de un error normalizado (el detalle va aparte). */
export function errorTitle(lang: Language, err: AppErrorInfo): string {
  const id = err.params["id"] ?? "";
  const path = err.params["path"] ?? "";
  const message = err.params["message"] ?? "";
  const candidates = err.params["candidates"] ?? "";
  switch (err.kind) {
    case "invalid_dir":
      return t(lang, "errors.invalid_dir", { path });
    case "unknown_docset":
      return t(lang, "errors.unknown_docset", { id });
    case "no_home_page":
      return t(lang, "errors.no_home_page", { id });
    case "load_failed":
      return t(lang, "errors.load_failed", { message });
    case "extraction_in_progress":
      return t(lang, "errors.extraction_in_progress", { id });
    case "no_feed_repo":
      return t(lang, "errors.no_feed_repo");
    case "feed_failed":
      return t(lang, "errors.feed_failed", { message });
    case "no_docsets_dir":
      return path !== ""
        ? t(lang, "errors.no_docsets_dir_with", { path })
        : t(lang, "errors.no_docsets_dir");
    case "empty_dir":
      return t(lang, "errors.empty_dir");
    case "catalog_missing":
      return t(lang, "errors.catalog_missing");
    case "unknown_feed":
      return t(lang, "errors.unknown_feed", { id });
    case "no_download_url":
      return t(lang, "errors.no_download_url", { id });
    case "unsupported_package":
      return t(lang, "errors.unsupported_package", { id });
    case "already_installed":
      return t(lang, "errors.already_installed", { id });
    case "ambiguous_match":
      return t(lang, "errors.ambiguous_match", { id, candidates });
    case "install_in_progress":
      return t(lang, "errors.install_in_progress", { id });
    case "download_failed":
      return t(lang, "errors.download_failed", { id, message });
    case "extract_failed":
      return t(lang, "errors.extract_failed", { id, message });
    case "invalid_package":
      return t(lang, "errors.invalid_package", { id, message });
    case "install_failed":
      return t(lang, "errors.install_failed", { id, message });
    default:
      return t(lang, "errors.unknown");
  }
}
