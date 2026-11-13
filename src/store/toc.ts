// Keeps a table of contents per viewer slot so history navigation can reuse it.
// The Viewer validates incoming heading lists and active-heading messages.
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
