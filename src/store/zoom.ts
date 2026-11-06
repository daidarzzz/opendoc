// Zoom del contenido de los docsets (global, recordado en localStorage).
// El Viewer lo aplica a sus iframes; `changedAt` dispara el aviso breve.
import { create } from "zustand";
import { clampZoom, zoomIn, zoomOut, ZOOM_DEFAULT } from "../lib/zoom";

const STORAGE_KEY = "opendoc.docZoom";

function load(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? ZOOM_DEFAULT : clampZoom(Number(raw));
  } catch {
    return ZOOM_DEFAULT;
  }
}

function save(level: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(level));
  } catch {
    // Sigue activo en esta sesión aunque no se pueda guardar.
  }
}

interface ZoomState {
  level: number;
  /** Marca de tiempo del último cambio (0 = ninguno en esta sesión). */
  changedAt: number;
  setLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

export const useZoom = create<ZoomState>()((set, get) => ({
  level: load(),
  changedAt: 0,
  setLevel: (level: number) => {
    const next = clampZoom(level);
    save(next);
    set({ level: next, changedAt: Date.now() });
  },
  zoomIn: () => get().setLevel(zoomIn(get().level)),
  zoomOut: () => get().setLevel(zoomOut(get().level)),
  reset: () => get().setLevel(ZOOM_DEFAULT),
}));
