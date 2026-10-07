// Wrappers tipados de los comandos Tauri. Único sitio con invoke()
// (los componentes usan estas funciones, nunca invoke() directo).
// El diálogo nativo (plugin-dialog) también vive aquí por la misma razón.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Docset,
  ScanReport,
  SearchRequest,
  SearchResponse,
  Settings,
  ThemeMode,
} from "./types";

/** Lista los docsets cargados (vacío hasta setDocsetsDir). */
export async function listDocsets(): Promise<Docset[]> {
  return invoke<Docset[]>("list_docsets");
}

/** Carga una carpeta de docsets (trabajo pesado, no bloquea la UI). */
export async function setDocsetsDir(path: string): Promise<ScanReport> {
  return invoke<ScanReport>("set_docsets_dir", { path });
}

let nextRequestId = 1;

export interface SearchOptions {
  docsetIds?: string[];
  limit?: number;
}

/** Busca con request_id autoincremental (la UI descarta obsoletas). */
export async function searchDocs(
  query: string,
  opts?: SearchOptions,
): Promise<SearchResponse> {
  const request: SearchRequest = {
    request_id: nextRequestId++,
    query,
    docset_ids: opts?.docsetIds ?? null,
    limit: opts?.limit ?? null,
  };
  return invoke<SearchResponse>("search", { request });
}

/** Extrae un tarix pendiente (largo, no bloquea). Devuelve resumen. */
export async function extractTarix(docsetId: string): Promise<ScanReport> {
  return invoke<ScanReport>("extract_tarix", { docsetId });
}

/** URL opendoc://<id>/<home> de la página de inicio. */
export async function getDocsetHome(docsetId: string): Promise<string> {
  return invoke<string>("get_docset_home", { docsetId });
}

/** Ajustes actuales (tema y carpeta de docsets). */
export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

/** Cambia el tema (persiste solo si cambió). */
export async function setTheme(theme: ThemeMode): Promise<Settings> {
  return invoke<Settings>("set_theme", { theme });
}

/** Diálogo nativo para elegir la carpeta de docsets (null = cancelado). */
export async function chooseFolder(): Promise<string | null> {
  const picked: unknown = await open({ directory: true, multiple: false });
  if (typeof picked === "string") return picked;
  if (Array.isArray(picked)) {
    const first: unknown = picked[0];
    return typeof first === "string" ? first : null;
  }
  return null;
}
