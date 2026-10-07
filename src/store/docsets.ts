// Slice de docsets cargados (origen: commands.ts).
import { create } from "zustand";
import { setDocsetsDir } from "../lib/commands";
import type { Docset, ScanIssue } from "../lib/types";

// TEMP T7: autocarga de fixtures para probar. Desaparece con ajustes (T9).
export const DEFAULT_DIR =
  "C:\\Users\\david\\Documents\\Projects\\opendoc\\src-tauri\\tests\\fixtures";

interface DocsetsState {
  docsets: Docset[];
  issues: ScanIssue[];
  status: string;
  error: string;
  load: (dir: string) => Promise<void>;
}

/** Normaliza rutas pegadas (espacios, comillas de "Copiar como ruta"). */
export function cleanDir(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "");
}

export const useDocsets = create<DocsetsState>()((set) => ({
  docsets: [],
  issues: [],
  status: "iniciando…",
  error: "",
  load: async (raw: string) => {
    const dir = cleanDir(raw);
    if (dir === "") {
      set({ error: "pega la ruta de la carpeta de docsets" });
      return;
    }
    set({ error: "", status: `cargando ${dir}…` });
    try {
      const report = await setDocsetsDir(dir);
      set({
        docsets: report.docsets,
        issues: report.issues,
        status: `cargados ${report.docsets.length} docsets, ${report.issues.length} issues`,
      });
    } catch (e) {
      set({
        status: "error al cargar",
        error: e instanceof Error ? e.message : JSON.stringify(e),
      });
    }
  },
}));
