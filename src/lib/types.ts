// Tipos espejo del backend (src-tauri/src/commands + docset::model).
// Si cambia el contrato Tauri, actualizar a mano (SPEC §4.4).

/** Un docset cargado (docset::Docset). */
export interface Docset {
  id: string;
  name: string;
  platform: string | null;
  version: string | null;
  bundle_id: string | null;
  home_path: string | null;
  root_path: string;
  contents_path: string;
}

/** Motivo de salto del escaneo (docset::IssueKind). */
export type IssueKind =
  | "NotDirectory"
  | "MissingContents"
  | "MissingDocuments"
  | "MissingIndex"
  | "InvalidInfoPlist"
  | "InvalidIndex"
  | "EntryUnreadable";

/** Entrada saltada del escaneo (docset::ScanIssue). */
export interface ScanIssue {
  path: string;
  kind: IssueKind;
}

/** Resultado del escaneo (docset::ScanReport). */
export interface ScanReport {
  docsets: Docset[];
  issues: ScanIssue[];
}

/** Una entrada encontrada (search::SearchResult). */
export interface SearchResult {
  docset_id: string;
  name: string;
  kind: string;
  path: string;
  score: number;
}

/** Petición de búsqueda (commands::SearchRequest). */
export interface SearchRequest {
  request_id: number;
  query: string;
  docset_ids: string[] | null;
  limit: number | null;
}

/** Respuesta con eco de request_id (commands::SearchResponse). */
export interface SearchResponse {
  request_id: number;
  results: SearchResult[];
}

/** Error de un comando (commands::ApiError, tag "kind"). */
export type ApiError =
  | { kind: "invalid_dir"; path: string }
  | { kind: "unknown_docset"; id: string }
  | { kind: "no_home_page"; id: string }
  | { kind: "load_failed"; message: string };
