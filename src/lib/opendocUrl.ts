// Utilidad para URLs del visor (SPEC §4.3).
// En Windows/Android Tauri sirve estos esquemas como
// http://opendoc.localhost/...; en el resto, el esquema directo.
// Se valida de verdad en T8 (protocolo + iframe); aquí solo la forma.

const SCHEME = "opendoc://";
const VIEWER_BASE = "http://opendoc.localhost/";

/** "opendoc://id/ruta" -> URL lista para el <iframe> (T8). */
export function toViewerUrl(backendUrl: string): string {
  if (!backendUrl.startsWith(SCHEME)) {
    throw new Error(`URL de docset inesperada: ${backendUrl}`);
  }
  return VIEWER_BASE + backendUrl.slice(SCHEME.length);
}
