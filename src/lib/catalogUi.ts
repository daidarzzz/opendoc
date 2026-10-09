// Lógica pura de la vista del catálogo (F3): sin React ni Tauri.
// Todo lo testeable en node vive aquí; los componentes solo pintan.

import type { ApiError, DocsetProgress, FeedEntry, InstallStatus } from "./types";

/** Filtro de estado de la lista (además de la búsqueda por texto). */
export type CatalogFilter = "all" | "installed" | "not-installed" | "updatable";

/** Acción principal que ofrece una fila según su estado. */
export type RowAction = "install" | "update" | "reinstall" | "none";

/** Fila unida: entrada del catálogo + su estado de instalación (si lo hay). */
export interface CatalogRowData {
  entry: FeedEntry;
  status: InstallStatus | null;
}

/**
 * Acción de una fila. El `update_available === null` solo bloquea el
 * botón de actualizar; si no está instalado, siempre se puede instalar.
 */
export function rowAction(status: InstallStatus | null): RowAction {
  if (!status) return "install";
  if (status.ambiguous) return "none";
  if (!status.installed) return "install";
  if (status.update_available === true) return "update";
  return "reinstall";
}

/** Tono del distintivo de estado (el componente lo mapea a clases). */
export type BadgeTone = "muted" | "ok" | "info" | "warn";

/** Texto y tono del distintivo de una fila. */
export function statusBadge(status: InstallStatus | null): {
  text: string;
  tone: BadgeTone;
} {
  if (!status) return { text: "No instalado", tone: "muted" };
  if (status.ambiguous) return { text: "Ambigua", tone: "warn" };
  if (!status.installed) return { text: "No instalado", tone: "muted" };
  if (status.update_available === true)
    return { text: "Actualizable", tone: "info" };
  return { text: "Instalado", tone: "ok" };
}

/** Línea de versiones: solo con datos reales, sin inventar nada. */
export function versionLine(status: InstallStatus | null): string {
  if (!status) return "";
  if (status.ambiguous)
    return `Coincide con varios: ${status.ambiguous_ids.join(", ")}`;
  const parts: string[] = [];
  if (status.installed_version) parts.push(`instalada ${status.installed_version}`);
  else if (status.installed) parts.push("instalada (versión desconocida)");
  parts.push(`disponible ${status.available_version}`);
  return parts.join(" · ");
}

/** Filtra por texto (nombre o id) y por estado. */
export function filterCatalog(
  rows: CatalogRowData[],
  query: string,
  filter: CatalogFilter,
): CatalogRowData[] {
  const q = query.trim().toLowerCase();
  return rows.filter(({ entry, status }) => {
    if (
      q !== "" &&
      !entry.name.toLowerCase().includes(q) &&
      !entry.id.toLowerCase().includes(q)
    ) {
      return false;
    }
    switch (filter) {
      case "all":
        return true;
      case "installed":
        return status !== null && status.installed && !status.ambiguous;
      case "not-installed":
        return status === null || (!status.installed && !status.ambiguous);
      case "updatable":
        return status !== null && status.update_available === true;
    }
  });
}

/** Texto comprensible de un error de comando, sin ocultar el detalle útil. */
export function apiErrorText(e: unknown): string {
  if (typeof e === "object" && e !== null && "kind" in e) {
    const err = e as ApiError;
    switch (err.kind) {
      case "no_feed_repo":
        return "Sin repositorio de feeds: configúralo arriba para descargar el catálogo.";
      case "feed_failed":
        return `Fallo del catálogo: ${err.message} Se muestran los datos en caché.`;
      case "catalog_missing":
        return "Sin catálogo descargado: configura el repo y pulsa Actualizar.";
      case "unknown_feed":
        return `Entrada desconocida: ${err.id}.`;
      case "no_download_url":
        return `${err.id}: sin URL de descarga utilizable.`;
      case "unsupported_package":
        return `${err.id}: formato no soportado (solo .tgz).`;
      case "already_installed":
        return `${err.id} ya está instalado.`;
      case "ambiguous_match":
        return `${err.id}: varias carpetas coinciden (${err.candidates.join(", ")}). Resuélvelo en disco.`;
      case "install_in_progress":
        return `${err.id}: ya hay una instalación en curso.`;
      case "download_failed":
        return `Descarga fallida (${err.id}): ${err.message}`;
      case "extract_failed":
        return `Extracción fallida (${err.id}): ${err.message}`;
      case "invalid_package":
        return `Paquete inválido (${err.id}): ${err.message}`;
      case "install_failed":
        return `Instalación fallida (${err.id}): ${err.message}`;
      case "no_docsets_dir":
        return err.path
          ? `Sin carpeta de docsets (${err.path}): elige una para instalar.`
          : "Sin carpeta de docsets: elige una para instalar.";
      case "load_failed":
        return `Fallo interno: ${err.message}`;
      case "invalid_dir":
        return `Carpeta inválida: ${err.path}`;
      case "unknown_docset":
        return `Docset desconocido: ${err.id}`;
      case "no_home_page":
        return `Sin página de inicio: ${err.id}`;
      case "extraction_in_progress":
        return `Extracción en curso: ${err.id}`;
    }
  }
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Bytes en forma legible (B/KB/MB/GB). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Línea de progreso. El porcentaje solo se muestra con total conocido
 * (dato real del servidor); sin total, solo bytes.
 */
export function formatProgress(p: DocsetProgress): string {
  switch (p.stage) {
    case "downloading":
      if (p.total_bytes !== null && p.total_bytes > 0) {
        const pct = Math.floor((p.received_bytes / p.total_bytes) * 100);
        return `${pct}% · ${formatBytes(p.received_bytes)} de ${formatBytes(p.total_bytes)}`;
      }
      return `${formatBytes(p.received_bytes)} descargados`;
    case "extracting":
      return p.files > 0
        ? `Extrayendo… (${p.files} entradas)`
        : "Extrayendo…";
    case "verifying":
      return "Verificando…";
    case "done":
      return "Instalado";
    case "error":
      return p.message ? `Error: ${p.message}` : "Error";
  }
}

/** Porcentaje 0-100 si el total es conocido, si no `null` (sin inventar). */
export function progressPercent(p: DocsetProgress): number | null {
  if (p.stage !== "downloading") return null;
  if (p.total_bytes === null || p.total_bytes <= 0) return null;
  return Math.min(100, Math.floor((p.received_bytes / p.total_bytes) * 100));
}

/** Fecha de última actualización (`fetched_at` en segundos) o "nunca". */
export function formatFetchedAt(fetchedAt: number | null): string {
  if (fetchedAt === null) return "nunca";
  const date = new Date(fetchedAt * 1000);
  if (Number.isNaN(date.getTime())) return "nunca";
  return date.toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
