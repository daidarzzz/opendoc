// Wrappers tipados de los comandos Tauri. Único sitio con invoke()
// (los componentes usan estas funciones, nunca invoke() directo).
// El diálogo nativo (plugin-dialog) también vive aquí por la misma razón.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CatalogStatus,
  CatalogSummary,
  Docset,
  DocsetProgress,
  FeedEntry,
  InstallStatus,
  InstallSummary,
  KindInfo,
  NavEntry,
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

/** Estado del catálogo (repo, última descarga, entradas en caché). */
export async function getCatalogStatus(): Promise<CatalogStatus> {
  return invoke<CatalogStatus>("get_catalog_status");
}

/** Configura el repo de feeds (`owner/repo` o URL). Valida y persiste. */
export async function setFeedRepo(repo: string): Promise<Settings> {
  return invoke<Settings>("set_feed_repo", { repo });
}

/** Descarga el catálogo (largo, no bloquea). Sin repo → `no_feed_repo`. */
export async function refreshCatalog(): Promise<CatalogSummary> {
  return invoke<CatalogSummary>("refresh_catalog");
}

/** Entradas en caché con búsqueda opcional (offline: sin red). */
export async function listCatalog(query?: string): Promise<FeedEntry[]> {
  return invoke<FeedEntry[]>("list_catalog", { query: query ?? null });
}

/** Instala un docset del catálogo (largo, no bloquea). Sin force, falla
 *  si ya está instalado o la coincidencia es ambigua. El progreso llega
 *  por el evento "docset-progress" (ver onDocsetProgress). */
export async function installDocset(
  feedId: string,
  force?: boolean,
): Promise<InstallSummary> {
  return invoke<InstallSummary>("install_docset", {
    feedId,
    force: force ?? null,
  });
}

/** Desinstala el docset que coincide con el feed y devuelve su id local. */
export async function uninstallDocset(feedId: string): Promise<string> {
  return invoke<string>("uninstall_docset", { feedId });
}

/** Estado de los feeds frente a los instalados (offline). Con feedId
 *  devuelve solo esa entrada o falla con `unknown_feed`. */
export async function getInstallStatus(
  feedId?: string,
): Promise<InstallStatus[]> {
  return invoke<InstallStatus[]>("get_install_status", {
    feedId: feedId ?? null,
  });
}

/** Escucha el progreso de instalaciones (evento "docset-progress"). */
export async function onDocsetProgress(
  handler: (progress: DocsetProgress) => void,
): Promise<UnlistenFn> {
  return listen<DocsetProgress>("docset-progress", (event) =>
    handler(event.payload),
  );
}

/** Tipos con conteo de un docset, en orden de muestra. */
export async function listKinds(docsetId: string): Promise<KindInfo[]> {
  return invoke<KindInfo[]>("list_kinds", { docsetId });
}

/** Página de entradas de un tipo (offset 0, tope 500 en el backend). */
export async function listEntries(
  docsetId: string,
  kind: string,
  offset?: number,
  limit?: number,
): Promise<NavEntry[]> {
  return invoke<NavEntry[]>("list_entries", {
    docsetId,
    kind,
    offset: offset ?? null,
    limit: limit ?? null,
  });
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
