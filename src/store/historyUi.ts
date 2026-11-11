// Apertura del panel de Historial (desde «Seguir leyendo» en el inicio).
import { create } from "zustand";

interface HistoryUiState {
  open: boolean;
  show: () => void;
  close: () => void;
}

export const useHistoryUi = create<HistoryUiState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));
