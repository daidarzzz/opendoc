// Apertura del panel de Historial y Favoritos (desde el inicio, la barra
// lateral o Ctrl/Cmd+Y).
import { create } from "zustand";

export type HistoryTab = "history" | "favorites";

interface HistoryUiState {
  open: boolean;
  tab: HistoryTab;
  show: (tab?: HistoryTab) => void;
  setTab: (tab: HistoryTab) => void;
  close: () => void;
}

export const useHistoryUi = create<HistoryUiState>()((set) => ({
  open: false,
  tab: "history",
  show: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  setTab: (tab) => set({ tab }),
  close: () => set({ open: false }),
}));
