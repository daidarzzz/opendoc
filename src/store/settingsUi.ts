// Apertura del panel de Ajustes (desde la barra lateral o Ctrl/Cmd+,).
import { create } from "zustand";

export type SettingsSection = "general" | "appearance" | "home" | "reading" | "docsets" | "shortcuts" | "about";

interface SettingsUiState {
  open: boolean;
  section: SettingsSection;
  show: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
}

export const useSettingsUi = create<SettingsUiState>()((set, get) => ({
  open: false,
  section: "general",
  show: (section) => set({ open: true, section: section ?? get().section }),
  close: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));
