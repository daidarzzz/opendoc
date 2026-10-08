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
  /** Icono como data-URL o null (genérico). */
  icon: string | null;
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
  | "EntryUnreadable"
  | "TarixFailed";

/** Entrada saltada del escaneo (docset::ScanIssue). */
export interface ScanIssue {
  path: string;
  kind: IssueKind;
}

/** Tarix pendiente de extraer (docset::PendingTarix). */
export interface PendingTarix {
  id: string;
  name: string;
  /** Icono como data-URL o null (genérico). */
  icon: string | null;
  root_path: string;
}

/** Resultado del escaneo (docset::ScanReport). */
export interface ScanReport {
  docsets: Docset[];
  pending_tarix: PendingTarix[];
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
  /** Filtros del texto resueltos, en orden de escritura. */
  applied: AppliedFilter[];
  /** Claves del texto sin docset. Vacío si nada resolvió (búsqueda normal). */
  unknown: string[];
}

/** Un filtro de texto resuelto (commands::AppliedFilter). */
export interface AppliedFilter {
  token: string;
  docset_id: string;
  installed: boolean;
}

/** Un tipo con su etiqueta y conteo (browse::KindInfo). */
export interface KindInfo {
  kind: string;
  label: string;
  /** Etiqueta inferida (no oficial en Dash): mostrar el código original. */
  inferred: boolean;
  count: number;
}

/** Una entrada navegable con su URL (browse::NavEntry). */
export interface NavEntry {
  docset_id: string;
  name: string;
  kind: string;
  path: string;
  url: string;
}

/** Error de un comando (commands::ApiError, tag "kind"). */
export type ApiError =
  | { kind: "invalid_dir"; path: string }
  | { kind: "unknown_docset"; id: string }
  | { kind: "no_home_page"; id: string }
  | { kind: "load_failed"; message: string }
  | { kind: "extraction_in_progress"; id: string }
  | { kind: "no_feed_repo" }
  | { kind: "feed_failed"; message: string };

/** Tema guardado (settings::ThemeMode). */
export type ThemeMode = "light" | "dark" | "system";

/** Ajustes persistentes (settings::Settings). */
export interface Settings {
  version: number;
  docsets_dir: string | null;
  theme: ThemeMode;
  /** Repo de feeds (`owner/repo`), null = sin configurar. */
  feed_url: string | null;
  /** Epoch de la última descarga del catálogo, null = nunca. */
  catalog_fetched_at: number | null;
}

/** Una parada del historial de pestaña (URL canónica opendoc://). */
export interface TabEntry {
  url: string;
  title: string;
}

/** Pestaña con su historial propio (store tabs, lógica en tabHistory). */
export interface Tab {
  id: string;
  docsetId: string;
  past: TabEntry[];
  current: TabEntry | null;
  future: TabEntry[];
  /** URL puesta por back/forward/apertura, pendiente de eco del iframe. */
  pendingUrl: string | null;
  /** Scroll guardado por URL (acotado). */
  scrolls: Record<string, number>;
}

/** Una entrada del catálogo (catalog::FeedEntry). */
export interface FeedEntry {
  id: string;
  name: string;
  version: string;
  urls: string[];
}

/** Estado del catálogo (commands::CatalogStatus). */
export interface CatalogStatus {
  repo: string | null;
  fetched_at: number | null;
  count: number;
}

/** Resumen tras refrescar (commands::CatalogSummary). */
export interface CatalogSummary {
  repo: string;
  count: number;
  skipped: number;
  fetched_at: number;
}
