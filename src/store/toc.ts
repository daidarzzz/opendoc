// Índice de la página por iframe del visor (los iframes de reserva guardan
// el suyo: al volver atrás el índice ya está). Los datos llegan validados
// desde el Viewer (`validateTocMessage` / `validateTocActiveMessage`).
import { create } from "zustand";
import type { TocItem } from "../lib/iframeMessages";

interface TocState {
  byFrame: Record<number, TocItem[]>;
  active: Record<number, number>;
  setItems: (frame: number, items: TocItem[]) => void;
  setActive: (frame: number, index: number) => void;
}

export const useToc = create<TocState>()((set) => ({
  byFrame: {},
  active: {},
  setItems: (frame, items) =>
    set((s) => ({ byFrame: { ...s.byFrame, [frame]: items }, active: { ...s.active, [frame]: 0 } })),
  setActive: (frame, index) => set((s) => ({ active: { ...s.active, [frame]: index } })),
}));
