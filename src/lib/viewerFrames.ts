/** Finds an already loaded slot so switching back never waits for another load event. */
export function findLoadedFrame(
  url: string,
  loadedUrls: readonly (string | null)[],
): number | null {
  const index = loadedUrls.findIndex((loadedUrl) => loadedUrl === url);
  return index < 0 ? null : index;
}

export function isPendingFrameLoad(
  pending: { index: number; url: string; version: number } | null,
  index: number,
  loadedUrl: string | null,
  version: number,
): boolean {
  return pending !== null && loadedUrl !== null && pending.index === index &&
    pending.url === loadedUrl && pending.version === version;
}
