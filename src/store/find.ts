// Búsqueda en la página del docset (Ctrl/Cmd+F). El estado vive aquí; el
// Viewer observa `seq` y manda cada petición al iframe visible, que
// responde con el total y la posición (validados en iframeMessages).
import { create } from "zustand";

/** Longitud máxima de la consulta (el script del iframe también la corta). */
export const FIND_MAX_QUERY = 200;

interface FindState {
  open: boolean;
  query: string;
  total: number;
  current: number;
  /** Ya hubo respuesta para la consulta actual (evita "sin resultados" prematuro). */
  answered: boolean;
  /** Se incrementa en cada petición para que el Viewer la envíe. */
  seq: number;
  /** Dirección de la última petición: 0 = buscar de nuevo, ±1 = moverse. */
  dir: -1 | 0 | 1;
  /** Se incrementa para pedir el foco del campo (abrir o reabrir). */
  focusSeq: number;
  openFind: (seed?: string) => void;
  close: () => void;
  setQuery: (query: string) => void;
  step: (dir: -1 | 1) => void;
  setResult: (total: number, current: number) => void;
}

export const useFind = create<FindState>()((set, get) => ({
  open: false,
  query: "",
  total: 0,
  current: 0,
  answered: false,
  seq: 0,
  dir: 0,
  focusSeq: 0,
  openFind: (seed?: string) => {
    const s = get();
    const clean = seed?.replace(/\s+/g, " ").trim().slice(0, FIND_MAX_QUERY);
    const query = clean ? clean : s.query;
    set({
      open: true,
      query,
      answered: false,
      dir: 0,
      seq: s.seq + 1,
      focusSeq: s.focusSeq + 1,
    });
  },
  close: () => {
    const s = get();
    if (!s.open) return;
    set({ open: false, total: 0, current: 0, answered: false, dir: 0, seq: s.seq + 1 });
  },
  setQuery: (query: string) => {
    set({ query: query.slice(0, FIND_MAX_QUERY), answered: false, dir: 0, seq: get().seq + 1 });
  },
  step: (dir: -1 | 1) => {
    const s = get();
    if (!s.open || s.query === "") return;
    set({ dir, seq: s.seq + 1 });
  },
  setResult: (total: number, current: number) => {
    if (!get().open) return;
    set({ total, current, answered: true });
  },
}));
