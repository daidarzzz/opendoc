// Menú contextual propio de OpenDoc (sustituye al del navegador).
// Quien lo abre construye las entradas; el componente solo las pinta.
import { create } from "zustand";

export type MenuIcon =
  | "copy"
  | "cut"
  | "paste"
  | "select"
  | "search"
  | "find"
  | "tab"
  | "back"
  | "forward"
  | "close"
  | "reopen"
  | "catalog"
  | "moon";

export type MenuEntry =
  | {
      kind: "item";
      id: string;
      label: string;
      icon?: MenuIcon;
      /** Atajo mostrado a la derecha (solo informativo). */
      hint?: string;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { kind: "separator"; id: string }
  /** Fila de zoom del docset (− 100% +). */
  | { kind: "zoom"; id: string };

export interface OpenMenu {
  x: number;
  y: number;
  entries: MenuEntry[];
}

interface ContextMenuState {
  menu: OpenMenu | null;
  show: (x: number, y: number, entries: MenuEntry[]) => void;
  close: () => void;
}

/** Quita separadores al principio, al final y repetidos. */
export function tidyEntries(entries: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (e.kind === "separator" && (out.length === 0 || out[out.length - 1]?.kind === "separator")) continue;
    out.push(e);
  }
  while (out.length > 0 && out[out.length - 1]?.kind === "separator") out.pop();
  return out;
}

export const useContextMenu = create<ContextMenuState>()((set) => ({
  menu: null,
  show: (x, y, entries) => {
    const tidy = tidyEntries(entries);
    set({ menu: tidy.length > 0 ? { x, y, entries: tidy } : null });
  },
  close: () => set({ menu: null }),
}));
