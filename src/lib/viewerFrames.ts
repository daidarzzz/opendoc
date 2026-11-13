/** Viewer slots for the visible page, a history neighbor, and a pending or prefetched page. */
export const FRAME_SLOTS = 3;

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

/**
 * Slot donde cargar una página nueva. Nunca el visible ni los excluidos.
 * Prioridad: vacío → no guarda una página vecina del historial (`keep`) →
 * el mostrado hace más tiempo. Con `allowKept = false` (precarga) no se
 * expulsa nunca una página vecina: si no hay hueco, `null`.
 */
export function pickFrameSlot(
  front: number | null,
  loadedUrls: readonly (string | null)[],
  keep: readonly string[],
  lastShown: readonly number[],
  allowKept: boolean,
  exclude: readonly number[] = [],
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < loadedUrls.length; i++) {
    if (i === front || exclude.includes(i)) continue;
    const url = loadedUrls[i];
    const kept = url !== null && keep.includes(url);
    if (kept && !allowKept) continue;
    // Menor es mejor: vacío (0) < libre (1) < vecino (2); desempate por antigüedad.
    const tier = url === null ? 0 : kept ? 2 : 1;
    const score = tier * 1e15 + (lastShown[i] ?? 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
