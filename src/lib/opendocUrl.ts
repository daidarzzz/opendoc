// Converts canonical document URLs to the viewer scheme for the current platform.
// Tauri maps the custom scheme to an HTTP origin on Windows and Android.
import { platform } from "@tauri-apps/plugin-os";
import { normalizeBackendUrl } from "./iframeMessages";

const SCHEME = "opendoc://";
const VIEWER_BASE = "http://opendoc.localhost/";

/** Converts a canonical OpenDoc URL to the iframe URL. */
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

/** Async wrapper for callers that use a promise-based navigation flow. */
export async function toViewerUrl(backendUrl: string): Promise<string> {
  return viewerUrl(backendUrl);
}

/** Builds the canonical URL for an indexed docset entry. */
export function docsetEntryUrl(docsetId: string, entryPath: string): string {
  return normalizeBackendUrl(`${SCHEME}${docsetId}/${entryPath}`);
}
