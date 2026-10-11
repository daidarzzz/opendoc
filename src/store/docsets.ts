// Slice de docsets cargados (origen: commands.ts).
import { create } from "zustand";
import {
  chooseFolder,
  extractTarix,
  getSettings,
  listDocsets,
  setDocsetsDir,
} from "../lib/commands";
import type { I18nKey, I18nVars } from "../lib/i18n";
import type { Docset, PendingTarix, ScanIssue } from "../lib/types";
import { useBrowse } from "./browse";

/** Estado traducible en el componente (los números se formatean al pintar). */
export interface DocsetsStatus {
  key: I18nKey;
  vars?: I18nVars;
}

interface DocsetsState {
  docsets: Docset[];
  pending: PendingTarix[];
  extractingIds: string[];
  issues: ScanIssue[];
  status: DocsetsStatus;
  error: unknown;
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
  /** Relee la lista de instalados (tras instalar desde el catálogo). */
  refresh: () => Promise<void>;
}

/** Normaliza rutas pegadas (espacios, comillas de "Copiar como ruta"). */
export function cleanDir(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "");
}

// F1: una sola inicialización efectiva. En dev, StrictMode monta dos
// veces y el efecto de arranque invoca `init()` duplicado: las llamadas
// concurrentes comparten la misma promesa en vez de relanzar la carga.
// Al asentarse (ok o error) se libera para permitir reintentar.
let initPromise: Promise<void> | null = null;

export const useDocsets = create<DocsetsState>()((set, get) => ({
  docsets: [],
  pending: [],
  extractingIds: [],
  issues: [],
  status: { key: "status.starting" },
  error: null,
  loading: true,
  savedDir: null,
  dirMissing: false,
  load: async (raw: string) => {
    const dir = cleanDir(raw);
    if (dir === "") {
      set({ error: { kind: "empty_dir" } });
      return;
    }
    set({ error: null, loading: true, status: { key: "status.loading", vars: { dir } } });
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
        status: loadedStatus(report.docsets.length, report.issues.length),
      });
    } catch (e) {
      set({ loading: false, status: { key: "status.loadError" }, error: e });
    }
  },
  init: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const settings = await getSettings();
        if (!settings.docsets_dir) {
          set({ loading: false, status: { key: "status.chooseDir" } });
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
            status: loadedStatus(report.docsets.length, report.issues.length),
          });
        } catch (e) {
          set({ loading: false, dirMissing: true, error: e });
        }
      } catch (e) {
        set({ loading: false, error: e });
      }
    })().finally(() => {
      initPromise = null;
    });
    return initPromise;
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
      error: null,
    }));
    try {
      const report = await extractTarix(id);
      useBrowse.getState().reset();
      set((s) => ({
        docsets: report.docsets,
        pending: report.pending_tarix,
        issues: report.issues,
        extractingIds: s.extractingIds.filter((x) => x !== id),
        status: loadedStatus(report.docsets.length, report.issues.length),
      }));
    } catch (e) {
      set((s) => ({
        extractingIds: s.extractingIds.filter((x) => x !== id),
        error: e,
      }));
    }
  },
  refresh: async () => {
    const savedDir = get().savedDir;
    try {
      if (savedDir) {
        set({
          loading: true,
          error: null,
          status: { key: "status.refreshing", vars: { dir: savedDir } },
        });
        const report = await setDocsetsDir(savedDir);
        useBrowse.getState().reset();
        set({
          docsets: report.docsets,
          pending: report.pending_tarix,
          issues: report.issues,
          loading: false,
          error: null,
          dirMissing: false,
          status: loadedStatus(report.docsets.length, report.issues.length),
        });
        return;
      }
      const docsets = await listDocsets();
      useBrowse.getState().reset();
      set({ docsets, loading: false, error: null });
    } catch (e) {
      set({ loading: false, error: e });
    }
  },
}));

function loadedStatus(docs: number, issues: number): DocsetsStatus {
  return { key: "status.loadedMany", vars: { docs, issues } };
}
