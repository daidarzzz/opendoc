// Wrappers tipados de los comandos Tauri. Único sitio con invoke()
// (los componentes usan estas funciones, nunca invoke() directo).
import { invoke } from "@tauri-apps/api/core";
import type {
  Docset,
  ScanReport,
  SearchRequest,
  SearchResponse,
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

/** URL opendoc://<id>/<home> de la página de inicio. */
export async function getDocsetHome(docsetId: string): Promise<string> {
  return invoke<string>("get_docset_home", { docsetId });
}
