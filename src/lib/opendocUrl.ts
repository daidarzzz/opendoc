// Utilidad para URLs del visor (SPEC §4.3).
// macOS/Linux sirven `opendoc://` nativo; Windows/Android lo sirven como
// http://opendoc.localhost/... (docs de register_uri_scheme_protocol).
import { platform } from "@tauri-apps/plugin-os";

const SCHEME = "opendoc://";
const VIEWER_BASE = "http://opendoc.localhost/";

/** "opendoc://id/ruta" -> URL lista para el <iframe>. */
export async function toViewerUrl(backendUrl: string): Promise<string> {
  if (!backendUrl.startsWith(SCHEME)) {
    throw new Error(`URL de docset inesperada: ${backendUrl}`);
  }
  const rest = backendUrl.slice(SCHEME.length);
  const os = await platform();
  if (os === "windows" || os === "android") {
    return VIEWER_BASE + rest;
  }
  return backendUrl;
}
