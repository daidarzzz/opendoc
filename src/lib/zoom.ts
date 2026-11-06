// Zoom del contenido de los docsets (lógica pura). Pasos fijos, como en
// los navegadores, para que Ctrl+rueda y Ctrl +/- se sientan previsibles.
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
export const ZOOM_DEFAULT = 1;

/** Nivel válido: número finito dentro de rango; lo demás → 1. */
export function clampZoom(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw));
}

/** Siguiente paso por encima del nivel actual (tope en el máximo). */
export function zoomIn(level: number): number {
  const cur = clampZoom(level);
  return ZOOM_STEPS.find((s) => s > cur + 1e-6) ?? ZOOM_MAX;
}

/** Paso anterior por debajo del nivel actual (tope en el mínimo). */
export function zoomOut(level: number): number {
  const cur = clampZoom(level);
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    const step = ZOOM_STEPS[i];
    if (step < cur - 1e-6) return step;
  }
  return ZOOM_MIN;
}

/** `1.25` → `"125%"`. */
export function formatZoom(level: number): string {
  return `${Math.round(clampZoom(level) * 100)}%`;
}
