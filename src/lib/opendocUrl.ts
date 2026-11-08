// Utilidad para URLs del visor (SPEC §4.3).
// macOS/Linux sirven `opendoc://` nativo; Windows/Android lo sirven como
// http://opendoc.localhost/... (docs de register_uri_scheme_protocol).
import { platform } from "@tauri-apps/plugin-os";
import { normalizeBackendUrl } from "./iframeMessages";

const SCHEME = "opendoc://";
const VIEWER_BASE = "http://opendoc.localhost/";

/** "opendoc://id/ruta" -> URL lista para el <iframe> (síncrono). */
export function viewerUrl(backendUrl: string): string {
  if (!backendUrl.startsWith(SCHEME)) {
    throw new Error(`URL de docset inesperada: ${backendUrl}`);
  }
  const rest = backendUrl.slice(SCHEME.length);
  const os = platform();
  if (os === "windows" || os === "android") {
    return VIEWER_BASE + rest;
  }
  return backendUrl;
}

/** Variante asíncrona (valida el formato; lanza si no es opendoc://). */
export async function toViewerUrl(backendUrl: string): Promise<string> {
  return viewerUrl(backendUrl);
}

/** URL backend (canónica) de una entrada concreta del índice. */
export function docsetEntryUrl(docsetId: string, entryPath: string): string {
  return normalizeBackendUrl(`${SCHEME}${docsetId}/${entryPath}`);
}
