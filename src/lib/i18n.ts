// Diccionarios de la interfaz (en/es). `en` es la fuente de verdad:
// `es` se anota como `typeof en` para que `tsc` falle si falta o sobra
// una clave en un idioma. Nada fuera de este fichero contiene texto
// visible traducible (lo vigila `i18n.test.ts`).
// Interpolación con `{nombre}`; plurales con claves One/Many + `tn()`.
import type { Language } from "./types";

/** Nombre de cada idioma, escrito en su propio idioma. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

/** Solo en/es existen: cualquier otro valor cae a inglés. */
export function normalizeLanguage(value: unknown): Language {
  return value === "es" ? "es" : "en";
}

function localeOf(lang: Language): string {
  return lang === "es" ? "es-ES" : "en-US";
}

/** Aplica el idioma al documento (lectores de pantalla, correctores). */
export function applyDocumentLang(lang: Language): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
}

// Sin parpadeo: el inglés se aplica al importar (es el valor por defecto).
applyDocumentLang("en");

/** Números con el formato del idioma elegido. */
export function formatCount(lang: Language, n: number): string {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat(localeOf(lang)).format(n);
}

/** Fecha/hora de `fetched_at` (segundos) o "nunca"/"never". */
export function formatDateTime(lang: Language, epochSec: number | null): string {
  if (epochSec === null) return t(lang, "common.never");
  const date = new Date(epochSec * 1000);
  if (Number.isNaN(date.getTime())) return t(lang, "common.never");
  return new Intl.DateTimeFormat(localeOf(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export const en = {
  "common.retry": "Retry",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.install": "Install",
  "common.never": "never",
  "common.details": "Details",
  "common.dismiss": "Dismiss",
  "common.genericIcon": "Generic icon for {name}",

  "app.resizeSidebar": "Resize sidebar",
  "app.closeFailed": "Could not close the window",

  "settings.title": "Settings",
  "settings.close": "Close settings",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.themeSystem": "System",
  "settings.language": "Language",
  "settings.restoreTabs": "Restore tabs on startup",
  "settings.docsetsFolder": "Docsets folder",
  "settings.notConfigured": "Not configured",
  "settings.chooseFolder": "Choose folder…",
  "settings.pendingTarix": "Pending install (tarix)",
  "settings.extracting": "Extracting…",
  "settings.dirUnavailable": "Folder unavailable",
  "settings.diskHint": "(disk disconnected?)",
  "settings.chooseAnother": "Choose another folder",
  "settings.issuesSuffix": "issues (see T6 console)",
  "settings.docsetsNav": "Docsets",

  "status.starting": "starting…",
  "status.enterDir": "paste the path of your docsets folder",
  "status.loading": "loading {dir}…",
  "status.loadedMany": "{docs} docsets loaded, {issues} issues",
  "status.loadError": "load error",
  "status.chooseDir": "choose your docsets folder",
  "status.refreshing": "refreshing {dir}…",

  "tabs.back": "Back (Alt+←)",
  "tabs.forward": "Forward (Alt+→)",
  "tabs.list": "Tabs",
  "tabs.newTab": "New tab",
  "tabs.closeTab": "Close tab {title}",

  "viewer.viewer": "Viewer",
  "viewer.pendingTarix": "This docset exists but is not installed yet (pending tarix).",
  "viewer.docsetMissing":
    "This tab's docset is not available (uninstalled or in another folder). The tab is kept in case it comes back.",
  "viewer.loading": "Loading {title}…",
  "viewer.iframeTitle": "Documentation for {title}",
  "viewer.folderGone": "The saved folder is not available",
  "viewer.pickFolder": "Pick your docsets folder to get started.",
  "viewer.chooseAnother": "Choose another folder",
  "viewer.chooseFolder": "Choose folder",

  "welcome.searchDocs": "Search documentation · {mod} K",
  "welcome.searchCatalog": "Browse the catalog",
  "welcome.shortcuts": "Keyboard shortcuts",
  "welcome.search": "Search",
  "welcome.newTab": "New tab",
  "welcome.closeTab": "Close tab",
  "welcome.filterBy": "Filter by docset:",
  "welcome.docCountOne": "1 docset loaded",
  "welcome.docCountMany": "{n} docsets loaded",

  "palette.dialog": "Search the documentation",
  "palette.filters": "Docset filters",
  "palette.removeFilter": "Filter: {name}, remove",
  "palette.removeFilterTitle": "Filter: {name} (click to remove)",
  "palette.notInstalled": "(not installed)",
  "palette.unknownFilter": "Unknown filter: {name}, remove",
  "palette.unknownTitle": "Matches no docset (click to remove)",
  "palette.unknownSuffix": "{name} · not found",
  "palette.ghost": "Search… (Esc to close)",
  "palette.input": "Search the documentation",
  "palette.emptyHint": "Type to search the loaded docsets.",
  "palette.searchingIn": "Searching in {names}…",
  "palette.noResults": "No results.",

  "browse.tree": "Browse docsets",
  "browse.empty": "No docsets loaded.",
  "browse.collapse": "Collapse",
  "browse.expand": "Expand",
  "browse.loadingKinds": "Loading types…",
  "browse.kindsError": "Could not load types.",
  "browse.noEntries": "No entries.",
  "browse.inferredTitle": "Inferred label, not official in Dash (code: {kind})",
  "browse.entriesError": "Could not load entries.",
  "browse.loadingEntry": "Loading entry",

  "catalog.title": "Catalog",
  "catalog.main": "Docset catalog",
  "catalog.backToViewer": "Back to viewer",
  "catalog.viewer": "Viewer",
  "catalog.filterAll": "All",
  "catalog.filterInstalled": "Installed",
  "catalog.filterNotInstalled": "Not installed",
  "catalog.filterUpdatable": "Updatable",
  "catalog.entriesOne": "1 entry",
  "catalog.entriesMany": "{n} entries",
  "catalog.refresh": "Refresh",
  "catalog.refreshing": "Refreshing…",
  "catalog.refreshTitle": "Download the catalog again",
  "catalog.repo": "Repo:",
  "catalog.notConfigured": "not configured",
  "catalog.updatedAt": "· updated: {date}",
  "catalog.refreshedMany": "{count} entries ({skipped} skipped)",
  "catalog.setupHelp": "Set the feeds repository (owner/repo or GitHub URL) to download the catalog.",
  "catalog.repoPlaceholder": "owner/repo or GitHub URL",
  "catalog.repoLabel": "Feeds repository",
  "catalog.saving": "Saving…",
  "catalog.searchPlaceholder": "Search docsets…",
  "catalog.searchLabel": "Search docsets",
  "catalog.filterLabel": "Filter by status",
  "catalog.loading": "Loading catalog…",
  "catalog.retry": "Retry",
  "catalog.emptySetup": "Empty catalog: set the repo and press Refresh.",
  "catalog.noResults": "No results",
  "catalog.noResultsFor": "No results for “{query}”",
  "catalog.actionInstall": "Install",
  "catalog.actionUpdate": "Update",
  "catalog.actionReinstall": "Reinstall",
  "catalog.actionBusy": "Working…",
  "catalog.uninstall": "Uninstall",
  "catalog.uninstalling": "Uninstalling…",
  "catalog.confirmUninstall": "Confirm",
  "catalog.cancelUninstall": "Cancel",
  "catalog.installedOk": "Installed successfully.",
  "catalog.dismissNotice": "Dismiss notice for {name}",
  "catalog.dismissError": "Dismiss error for {name}",
  "catalog.chooseFolder": "Choose docsets folder",
  "catalog.sourcesOne": "1 source",
  "catalog.sourcesMany": "{n} sources",
  "catalog.badgeNotInstalled": "Not installed",
  "catalog.badgeAmbiguous": "Ambiguous",
  "catalog.badgeUpdatable": "Updatable",
  "catalog.badgeInstalled": "Installed",
  "catalog.versionsAmbiguous": "Matches several: {ids}",
  "catalog.versionsInstalledUnknown": "installed (unknown version)",
  "catalog.versionsInstalled": "installed {version}",
  "catalog.versionsAvailable": "available {version}",
  "catalog.progressDownloading": "{pct}% · {done} of {total}",
  "catalog.progressDownloaded": "{bytes} downloaded",
  "catalog.progressExtracting": "Extracting…",
  "catalog.progressExtractingFiles": "Extracting… ({n} entries)",
  "catalog.progressVerifying": "Verifying…",
  "catalog.progressDone": "Installed",
  "catalog.progressError": "Error",
  "catalog.progressErrorWith": "Error: {message}",

  "errors.unknown": "Unexpected error",
  "errors.empty_dir": "Enter a docsets folder path first.",
  "errors.invalid_dir": "Invalid folder: {path}",
  "errors.unknown_docset": "Unknown docset: {id}",
  "errors.no_home_page": "No home page: {id}",
  "errors.load_failed": "Internal failure: {message}",
  "errors.extraction_in_progress": "Extraction in progress: {id}",
  "errors.no_feed_repo": "No feeds repository set: configure it above to download the catalog.",
  "errors.feed_failed": "Catalog failed: {message} Showing cached data.",
  "errors.no_docsets_dir": "No docsets folder: choose one to install.",
  "errors.no_docsets_dir_with": "No docsets folder ({path}): choose one to install.",
  "errors.catalog_missing": "No catalog downloaded: set the repo and press Refresh.",
  "errors.unknown_feed": "Unknown entry: {id}.",
  "errors.no_download_url": "{id}: no usable download URL.",
  "errors.unsupported_package": "{id}: unsupported format (only .tgz).",
  "errors.already_installed": "{id} is already installed.",
  "errors.ambiguous_match": "{id}: several folders match ({candidates}). Fix it on disk.",
  "errors.install_in_progress": "{id}: an install is already running.",
  "errors.download_failed": "Download failed ({id}): {message}",
  "errors.extract_failed": "Extraction failed ({id}): {message}",
  "errors.invalid_package": "Invalid package ({id}): {message}",
  "errors.install_failed": "Install failed ({id}): {message}",
};

export type Dict = typeof en;

export const es: Dict = {
  "common.retry": "Reintentar",
  "common.close": "Cerrar",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.install": "Instalar",
  "common.never": "nunca",
  "common.details": "Detalles",
  "common.dismiss": "Descartar",
  "common.genericIcon": "Icono genérico de {name}",

  "app.resizeSidebar": "Cambiar ancho del panel lateral",
  "app.closeFailed": "No se pudo cerrar la ventana",

  "settings.title": "Ajustes",
  "settings.close": "Cerrar ajustes",
  "settings.theme": "Tema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.themeSystem": "Sistema",
  "settings.language": "Idioma",
  "settings.restoreTabs": "Restaurar pestañas al abrir",
  "settings.docsetsFolder": "Carpeta de docsets",
  "settings.notConfigured": "Sin configurar",
  "settings.chooseFolder": "Elegir carpeta…",
  "settings.pendingTarix": "Por instalar (tarix)",
  "settings.extracting": "Extrayendo…",
  "settings.dirUnavailable": "Carpeta no disponible",
  "settings.diskHint": "(¿disco desconectado?)",
  "settings.chooseAnother": "Elegir otra carpeta",
  "settings.issuesSuffix": "issues (ver consola T6)",
  "settings.docsetsNav": "Docsets",

  "status.starting": "iniciando…",
  "status.enterDir": "pega la ruta de la carpeta de docsets",
  "status.loading": "cargando {dir}…",
  "status.loadedMany": "{docs} docsets cargados, {issues} issues",
  "status.loadError": "error al cargar",
  "status.chooseDir": "elige tu carpeta de docsets",
  "status.refreshing": "actualizando {dir}…",

  "tabs.back": "Atrás (Alt+←)",
  "tabs.forward": "Adelante (Alt+→)",
  "tabs.list": "Pestañas",
  "tabs.newTab": "Nueva pestaña",
  "tabs.closeTab": "Cerrar pestaña {title}",

  "viewer.viewer": "Visor",
  "viewer.pendingTarix": "Este docset existe pero aún no está instalado (tarix pendiente).",
  "viewer.docsetMissing":
    "El docset de esta pestaña no está disponible (desinstalado o en otra carpeta). La pestaña se conserva por si vuelve.",
  "viewer.loading": "Cargando {title}…",
  "viewer.iframeTitle": "Documentación de {title}",
  "viewer.folderGone": "La carpeta guardada no está disponible",
  "viewer.pickFolder": "Elige tu carpeta de docsets para empezar.",
  "viewer.chooseAnother": "Elegir otra carpeta",
  "viewer.chooseFolder": "Elegir carpeta",

  "welcome.searchDocs": "Buscar documentación · {mod} K",
  "welcome.searchCatalog": "Buscar en el catálogo",
  "welcome.shortcuts": "Atajos de teclado",
  "welcome.search": "Buscar",
  "welcome.newTab": "Nueva pestaña",
  "welcome.closeTab": "Cerrar pestaña",
  "welcome.filterBy": "Filtra por docset:",
  "welcome.docCountOne": "1 docset cargado",
  "welcome.docCountMany": "{n} docsets cargados",

  "palette.dialog": "Buscar en la documentación",
  "palette.filters": "Filtros de docsets",
  "palette.removeFilter": "Filtro: {name}, quitar",
  "palette.removeFilterTitle": "Filtro: {name} (clic para quitar)",
  "palette.notInstalled": "(sin instalar)",
  "palette.unknownFilter": "Filtro desconocido: {name}, quitar",
  "palette.unknownTitle": "No coincide con ningún docset (clic para quitar)",
  "palette.unknownSuffix": "{name} · no encontrado",
  "palette.ghost": "Buscar… (Esc para cerrar)",
  "palette.input": "Buscar en la documentación",
  "palette.emptyHint": "Escribe para buscar en los docsets cargados.",
  "palette.searchingIn": "Buscando en {names}…",
  "palette.noResults": "Sin resultados.",

  "browse.tree": "Navegación por docsets",
  "browse.empty": "Sin docsets cargados.",
  "browse.collapse": "Contraer",
  "browse.expand": "Expandir",
  "browse.loadingKinds": "Cargando tipos…",
  "browse.kindsError": "Error al cargar tipos.",
  "browse.noEntries": "Sin entradas.",
  "browse.inferredTitle": "Etiqueta inferida, no oficial en Dash (código: {kind})",
  "browse.entriesError": "Error al cargar entradas.",
  "browse.loadingEntry": "Cargando entrada",

  "catalog.title": "Catálogo",
  "catalog.main": "Catálogo de docsets",
  "catalog.backToViewer": "Volver al visor",
  "catalog.viewer": "Visor",
  "catalog.filterAll": "Todos",
  "catalog.filterInstalled": "Instalados",
  "catalog.filterNotInstalled": "No instalados",
  "catalog.filterUpdatable": "Actualizables",
  "catalog.entriesOne": "1 entrada",
  "catalog.entriesMany": "{n} entradas",
  "catalog.refresh": "Actualizar",
  "catalog.refreshing": "Actualizando…",
  "catalog.refreshTitle": "Descargar de nuevo el catálogo",
  "catalog.repo": "Repo:",
  "catalog.notConfigured": "sin configurar",
  "catalog.updatedAt": "· actualizado: {date}",
  "catalog.refreshedMany": "{count} entradas ({skipped} saltadas)",
  "catalog.setupHelp": "Configura el repositorio de feeds (owner/repo o URL de GitHub) para descargar el catálogo.",
  "catalog.repoPlaceholder": "owner/repo o URL de GitHub",
  "catalog.repoLabel": "Repositorio de feeds",
  "catalog.saving": "Guardando…",
  "catalog.searchPlaceholder": "Buscar docsets…",
  "catalog.searchLabel": "Buscar docsets",
  "catalog.filterLabel": "Filtrar por estado",
  "catalog.loading": "Cargando catálogo…",
  "catalog.retry": "Reintentar",
  "catalog.emptySetup": "Catálogo vacío: configura el repo y pulsa Actualizar.",
  "catalog.noResults": "Sin resultados",
  "catalog.noResultsFor": "Sin resultados para «{query}»",
  "catalog.actionInstall": "Instalar",
  "catalog.actionUpdate": "Actualizar",
  "catalog.actionReinstall": "Reinstalar",
  "catalog.actionBusy": "En curso…",
  "catalog.uninstall": "Desinstalar",
  "catalog.uninstalling": "Desinstalando…",
  "catalog.confirmUninstall": "Confirmar",
  "catalog.cancelUninstall": "Cancelar",
  "catalog.installedOk": "Instalado correctamente.",
  "catalog.dismissNotice": "Descartar aviso de {name}",
  "catalog.dismissError": "Descartar error de {name}",
  "catalog.chooseFolder": "Elegir carpeta de docsets",
  "catalog.sourcesOne": "1 origen",
  "catalog.sourcesMany": "{n} orígenes",
  "catalog.badgeNotInstalled": "No instalado",
  "catalog.badgeAmbiguous": "Ambigua",
  "catalog.badgeUpdatable": "Actualizable",
  "catalog.badgeInstalled": "Instalado",
  "catalog.versionsAmbiguous": "Coincide con varios: {ids}",
  "catalog.versionsInstalledUnknown": "instalada (versión desconocida)",
  "catalog.versionsInstalled": "instalada {version}",
  "catalog.versionsAvailable": "disponible {version}",
  "catalog.progressDownloading": "{pct}% · {done} de {total}",
  "catalog.progressDownloaded": "{bytes} descargados",
  "catalog.progressExtracting": "Extrayendo…",
  "catalog.progressExtractingFiles": "Extrayendo… ({n} entradas)",
  "catalog.progressVerifying": "Verificando…",
  "catalog.progressDone": "Instalado",
  "catalog.progressError": "Error",
  "catalog.progressErrorWith": "Error: {message}",

  "errors.unknown": "Error inesperado",
  "errors.empty_dir": "Pega la ruta de la carpeta de docsets.",
  "errors.invalid_dir": "Carpeta inválida: {path}",
  "errors.unknown_docset": "Docset desconocido: {id}",
  "errors.no_home_page": "Sin página de inicio: {id}",
  "errors.load_failed": "Fallo interno: {message}",
  "errors.extraction_in_progress": "Extracción en curso: {id}",
  "errors.no_feed_repo": "Sin repositorio de feeds: configúralo arriba para descargar el catálogo.",
  "errors.feed_failed": "Fallo del catálogo: {message} Se muestran los datos en caché.",
  "errors.no_docsets_dir": "Sin carpeta de docsets: elige una para instalar.",
  "errors.no_docsets_dir_with": "Sin carpeta de docsets ({path}): elige una para instalar.",
  "errors.catalog_missing": "Sin catálogo descargado: configura el repo y pulsa Actualizar.",
  "errors.unknown_feed": "Entrada desconocida: {id}.",
  "errors.no_download_url": "{id}: sin URL de descarga utilizable.",
  "errors.unsupported_package": "{id}: formato no soportado (solo .tgz).",
  "errors.already_installed": "{id} ya está instalado.",
  "errors.ambiguous_match": "{id}: varias carpetas coinciden ({candidates}). Resuélvelo en disco.",
  "errors.install_in_progress": "{id}: ya hay una instalación en curso.",
  "errors.download_failed": "Descarga fallida ({id}): {message}",
  "errors.extract_failed": "Extracción fallida ({id}): {message}",
  "errors.invalid_package": "Paquete inválido ({id}): {message}",
  "errors.install_failed": "Instalación fallida ({id}): {message}",
};

export type I18nKey = keyof Dict;
export type I18nVars = Record<string, string | number>;

function dictOf(lang: Language): Dict {
  return lang === "es" ? es : en;
}

/** Traduce una clave con interpolación `{var}` (números con Intl). */
export function t(lang: Language, key: I18nKey, vars?: I18nVars): string {
  let out: string = dictOf(lang)[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      const text = typeof value === "number" ? formatCount(lang, value) : value;
      out = out.split(`{${name}}`).join(text);
    }
  }
  return out;
}

/** Singular/plural sencillo (`n === 1` → `oneKey`). */
export function tn(
  lang: Language,
  n: number,
  oneKey: I18nKey,
  manyKey: I18nKey,
  vars?: I18nVars,
): string {
  return t(lang, n === 1 ? oneKey : manyKey, vars);
}
