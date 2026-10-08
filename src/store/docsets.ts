// Slice de docsets cargados (origen: commands.ts).
import { create } from "zustand";
import {
  chooseFolder,
  extractTarix,
  getSettings,
  setDocsetsDir,
} from "../lib/commands";
import type { Docset, PendingTarix, ScanIssue } from "../lib/types";
import { useBrowse } from "./browse";

interface DocsetsState {
  docsets: Docset[];
  pending: PendingTarix[];
  extractingIds: string[];
  issues: ScanIssue[];
  status: string;
  error: string;
  loading: boolean;
  /** Ruta guardada en ajustes (aunque ya no exista: disco desconectado). */
  savedDir: string | null;
  /** Guardada pero ilegible: banner que ofrece elegir otra. */
  dirMissing: boolean;
  load: (dir: string) => Promise<void>;
  /** Arranque: lee ajustes y carga la carpeta guardada si la hay. */
  init: () => Promise<void>;
  /** Diálogo nativo + carga. */
  choose: () => Promise<void>;
  /** Extrae un tarix pendiente (muestra "extrayendo…" y desactiva). */
  extract: (id: string) => Promise<void>;
}

/** Normaliza rutas pegadas (espacios, comillas de "Copiar como ruta"). */
export function cleanDir(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "");
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : JSON.stringify(e);
}

export const useDocsets = create<DocsetsState>()((set) => ({
  docsets: [],
  pending: [],
  extractingIds: [],
  issues: [],
  status: "iniciando…",
  error: "",
  loading: true,
  savedDir: null,
  dirMissing: false,
  load: async (raw: string) => {
    const dir = cleanDir(raw);
    if (dir === "") {
      set({ error: "pega la ruta de la carpeta de docsets" });
      return;
    }
    set({ error: "", loading: true, status: `cargando ${dir}…` });
    try {
      const report = await setDocsetsDir(dir);
      useBrowse.getState().reset();
      set({
        docsets: report.docsets,
        pending: report.pending_tarix,
        issues: report.issues,
        savedDir: dir,
        dirMissing: false,
        loading: false,
        status: `cargados ${report.docsets.length} docsets, ${report.issues.length} issues`,
      });
    } catch (e) {
      set({ loading: false, status: "error al cargar", error: errText(e) });
    }
  },
  init: async () => {
    try {
      const settings = await getSettings();
      if (!settings.docsets_dir) {
        set({ loading: false, status: "elige tu carpeta de docsets" });
        return;
      }
      // Se conserva el valor guardado aunque no exista (disco desconectado).
      set({ savedDir: settings.docsets_dir });
      try {
        const report = await setDocsetsDir(settings.docsets_dir);
        useBrowse.getState().reset();
        set({
          docsets: report.docsets,
          pending: report.pending_tarix,
          issues: report.issues,
          dirMissing: false,
          loading: false,
          status: `cargados ${report.docsets.length} docsets, ${report.issues.length} issues`,
        });
      } catch (e) {
        set({ loading: false, dirMissing: true, error: errText(e) });
      }
    } catch (e) {
      set({ loading: false, error: errText(e) });
    }
  },
  choose: async () => {
    const picked = await chooseFolder();
    if (picked) {
      const { load } = useDocsets.getState();
      await load(picked);
    }
  },
  extract: async (id: string) => {
    set((s) => ({
      extractingIds: s.extractingIds.includes(id)
        ? s.extractingIds
        : [...s.extractingIds, id],
      error: "",
    }));
    try {
      const report = await extractTarix(id);
      useBrowse.getState().reset();
      set((s) => ({
        docsets: report.docsets,
        pending: report.pending_tarix,
        issues: report.issues,
        extractingIds: s.extractingIds.filter((x) => x !== id),
        status: `cargados ${report.docsets.length} docsets, ${report.issues.length} issues`,
      }));
    } catch (e) {
      set((s) => ({
        extractingIds: s.extractingIds.filter((x) => x !== id),
        error: errText(e),
      }));
    }
  },
}));
