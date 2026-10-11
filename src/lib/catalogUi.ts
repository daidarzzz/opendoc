// Lógica pura de la vista del catálogo (F3): sin React ni Tauri.
// Todo lo testeable en node vive aquí; los componentes solo pintan.

import { t, type I18nKey } from "./i18n";
import type { DocsetProgress, FeedEntry, InstallStatus } from "./types";
import type { Language } from "./types";

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

/** Clave de texto y tono del distintivo de una fila (texto vía `t()`). */
export function statusBadge(status: InstallStatus | null): {
  key: I18nKey;
  tone: BadgeTone;
} {
  if (!status) return { key: "catalog.badgeNotInstalled", tone: "muted" };
  if (status.ambiguous) return { key: "catalog.badgeAmbiguous", tone: "warn" };
  if (!status.installed) return { key: "catalog.badgeNotInstalled", tone: "muted" };
  if (status.update_available === true)
    return { key: "catalog.badgeUpdatable", tone: "info" };
  return { key: "catalog.badgeInstalled", tone: "ok" };
}

/** Línea de versiones: solo con datos reales, sin inventar nada. */
export function versionLine(status: InstallStatus | null, lang: Language): string {
  if (!status) return "";
  if (status.ambiguous)
    return t(lang, "catalog.versionsAmbiguous", { ids: status.ambiguous_ids.join(", ") });
  const parts: string[] = [];
  if (status.installed_version)
    parts.push(t(lang, "catalog.versionsInstalled", { version: status.installed_version }));
  else if (status.installed) parts.push(t(lang, "catalog.versionsInstalledUnknown"));
  parts.push(t(lang, "catalog.versionsAvailable", { version: status.available_version }));
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

/** Bytes en forma legible (número con Intl + unidad). */
export function formatBytes(lang: Language, n: number): string {
  if (!Number.isFinite(n) || n < 0) return `0 B`;
  const num = (v: number, digits: number): string =>
    new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(v);
  if (n < 1024) return `${num(Math.floor(n), 0)} B`;
  if (n < 1024 * 1024) return `${num(n / 1024, 1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${num(n / (1024 * 1024), 1)} MB`;
  return `${num(n / (1024 * 1024 * 1024), 1)} GB`;
}

/**
 * Línea de progreso. El porcentaje solo se muestra con total conocido
 * (dato real del servidor); sin total, solo bytes.
 */
export function formatProgress(p: DocsetProgress, lang: Language): string {
  switch (p.stage) {
    case "downloading":
      if (p.total_bytes !== null && p.total_bytes > 0) {
        const pct = Math.floor((p.received_bytes / p.total_bytes) * 100);
        return t(lang, "catalog.progressDownloading", {
          pct,
          done: formatBytes(lang, p.received_bytes),
          total: formatBytes(lang, p.total_bytes),
        });
      }
      return t(lang, "catalog.progressDownloaded", {
        bytes: formatBytes(lang, p.received_bytes),
      });
    case "extracting":
      return p.files > 0
        ? t(lang, "catalog.progressExtractingFiles", { n: p.files })
        : t(lang, "catalog.progressExtracting");
    case "verifying":
      return t(lang, "catalog.progressVerifying");
    case "done":
      return t(lang, "catalog.progressDone");
    case "error":
      return p.message
        ? t(lang, "catalog.progressErrorWith", { message: p.message })
        : t(lang, "catalog.progressError");
  }
}

/** Porcentaje 0-100 si el total es conocido, si no `null` (sin inventar). */
export function progressPercent(p: DocsetProgress): number | null {
  if (p.stage !== "downloading") return null;
  if (p.total_bytes === null || p.total_bytes <= 0) return null;
  return Math.min(100, Math.floor((p.received_bytes / p.total_bytes) * 100));
}
