// Slice del catálogo de docsets (F3): vista, datos F1 y operaciones F2.
// - Los datos viven aquí (zustand), no en componentes: al alternar con el
//   visor nada se pierde (las pestañas/búsqueda ni se enteran).
// - El éxito de una instalación lo confirma el `await installDocset`
//   (backend), nunca el evento: ante un error no se muestra éxito.
// - Doble clic: `busy` se fija síncrono antes del primer `await`; si ya
//   está ocupado, la llamada se ignora (el backend además responde
//   `install_in_progress`).
// - El listener de `docset-progress` solo alimenta el progreso visible;
//   la finalización la resuelve la promesa (sigue valiendo aunque el
//   componente se desmonte a mitad de una instalación).
import { create } from "zustand";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  getCatalogStatus,
  getInstallStatus,
  installDocset,
  listCatalog,
  onDocsetProgress,
  refreshCatalog,
  setFeedRepo,
} from "../lib/commands";
import type {
  CatalogStatus,
  DocsetProgress,
  FeedEntry,
  InstallStatus,
} from "../lib/types";
import { apiErrorText } from "../lib/catalogUi";
import type { CatalogFilter } from "../lib/catalogUi";
import { pmark, setProfileEnabled } from "../lib/profile";
import { useDocsets } from "./docsets";

export type CatalogView = "viewer" | "catalog";

/** Estado de una operación por feed (progreso indexado por feed_id). */
export interface FeedOp {
  busy: boolean;
  progress: DocsetProgress | null;
  error: string;
  /** `kind` del ApiError si lo hubo (p. ej. `no_docsets_dir`). */
  errorKind: string;
  done: boolean;
}

const idleOp: FeedOp = { busy: false, progress: null, error: "", errorKind: "", done: false };

/** `kind` de un error de comando, o "" si no es un ApiError. */
function errorKindOf(e: unknown): string {
  if (typeof e === "object" && e !== null && "kind" in e) {
    const kind: unknown = (e as { kind: unknown }).kind;
    return typeof kind === "string" ? kind : "";
  }
  return "";
}

interface CatalogState {
  view: CatalogView;
  status: CatalogStatus | null;
  entries: FeedEntry[];
  installMap: Record<string, InstallStatus>;
  /** Feeds con `update_available === true` (distintivo de la sidebar). */
  updatable: number;
  loading: boolean;
  refreshing: boolean;
  /** Error global (carga/actualización del catálogo). */
  error: string;
  /** Resumen de la última actualización manual. */
  refreshNote: string;
  query: string;
  filter: CatalogFilter;
  repoInput: string;
  repoBusy: boolean;
  repoError: string;
  ops: Record<string, FeedOp>;
  open: () => void;
  showViewer: () => void;
  setQuery: (query: string) => void;
  setFilter: (filter: CatalogFilter) => void;
  setRepoInput: (repoInput: string) => void;
  /** Carga inicial o recarga completa (caché local, sin red salvo refresh). */
  load: () => Promise<void>;
  /** Guarda el repo y recarga (valida en el backend). */
  saveRepo: (repo: string) => Promise<void>;
  /** Descarga el catálogo (largo); con error se conserva la caché. */
  refresh: () => Promise<void>;
  /** Instala o actualiza (`force` = actualizar/reinstalar). */
  install: (feedId: string, force: boolean) => Promise<void>;
  /** Relee el estado de un feed tras operar (confirmación del backend). */
  refreshFeed: (feedId: string) => Promise<void>;
  clearOp: (feedId: string) => void;
  /** Suscribe el progreso (el componente lo libera al desmontar). */
  subscribe: () => Promise<void>;
  unsubscribe: () => void;
}

let unlisten: UnlistenFn | null = null;
let seq = 0;
// FASE 0: eventos de progreso recibidos durante la instalación en curso
// (se reinicia en cada click; solo diagnóstico).
let progressEvents = 0;

function countUpdatable(map: Record<string, InstallStatus>): number {
  return Object.values(map).filter((s) => s.update_available === true).length;
}

function opOf(ops: Record<string, FeedOp>, feedId: string): FeedOp {
  return ops[feedId] ?? idleOp;
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  view: "viewer",
  status: null,
  entries: [],
  installMap: {},
  updatable: 0,
  loading: true,
  refreshing: false,
  error: "",
  refreshNote: "",
  query: "",
  filter: "all",
  repoInput: "",
  repoBusy: false,
  repoError: "",
  ops: {},

  open: () => {
    set({ view: "catalog" });
    if (get().entries.length === 0 && !get().status) void get().load();
  },
  showViewer: () => set({ view: "viewer" }),
  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  setRepoInput: (repoInput) => set({ repoInput }),

  load: async () => {
    const mySeq = ++seq;
    set({ loading: true, error: "" });
    try {
      const [status, entries, installStates] = await Promise.all([
        getCatalogStatus(),
        listCatalog(),
        getInstallStatus(),
      ]);
      if (mySeq !== seq) return; // Obsoleta: se descarta.
      const installMap: Record<string, InstallStatus> = {};
      for (const s of installStates) installMap[s.feed_id] = s;
      // FASE 0: el flag de profiling lo decide el backend.
      setProfileEnabled(status.profile_enabled);
      set({
        status,
        entries,
        installMap,
        updatable: countUpdatable(installMap),
        repoInput: status.repo ?? "",
        loading: false,
      });
    } catch (e) {
      if (mySeq !== seq) return;
      set({ loading: false, error: apiErrorText(e) });
    }
  },

  saveRepo: async (repo: string) => {
    if (get().repoBusy) return;
    set({ repoBusy: true, repoError: "" });
    try {
      await setFeedRepo(repo);
      const status = await getCatalogStatus();
      set({ status, repoInput: status.repo ?? "", repoBusy: false });
      await get().load();
    } catch (e) {
      set({ repoBusy: false, repoError: apiErrorText(e) });
    }
  },

  refresh: async () => {
    if (get().refreshing) return;
    set({ refreshing: true, error: "", refreshNote: "" });
    try {
      const summary = await refreshCatalog();
      set({
        refreshNote: `${summary.count} entradas (${summary.skipped} saltadas)`,
      });
      await get().load();
    } catch (e) {
      // La caché anterior se conserva: se muestra el error con los datos.
      set({ error: apiErrorText(e) });
      await get().load();
    } finally {
      set({ refreshing: false });
    }
  },

  install: async (feedId: string, force: boolean) => {
    if (opOf(get().ops, feedId).busy) return; // Doble clic: se ignora.
    // FASE 0: solo medida (click → usable; eventos contados aparte).
    const tClick = performance.now();
    progressEvents = 0;
    pmark("ui install click", { feedId, force });
    set((s) => ({
      ops: {
        ...s.ops,
        [feedId]: { busy: true, progress: null, error: "", errorKind: "", done: false },
      },
    }));
    try {
      // La confirmación es esta promesa (backend), no el evento.
      await installDocset(feedId, force);
      // Refresco consistente: estado del feed + lista de instalados.
      await get().refreshFeed(feedId);
      await useDocsets.getState().refresh();
      pmark("ui install usable", {
        feedId,
        ms: Math.round(performance.now() - tClick),
        progressEvents,
      });
      set((s) => ({
        ops: { ...s.ops, [feedId]: { ...opOf(s.ops, feedId), busy: false, done: true } },
      }));
    } catch (e) {
      const error = apiErrorText(e);
      const errorKind = errorKindOf(e);
      // FASE 0: solo medida.
      pmark("ui install error", {
        feedId,
        ms: Math.round(performance.now() - tClick),
        kind: errorKind,
        progressEvents,
      });
      // Ante el error no se asume nada: se reconsulta el estado real.
      try {
        await get().refreshFeed(feedId);
      } catch {
        // Si ni el estado se puede leer, se conserva el error original.
      }
      set((s) => ({
        ops: { ...s.ops, [feedId]: { ...opOf(s.ops, feedId), busy: false, error, errorKind } },
      }));
    }
  },

  clearOp: (feedId: string) => {
    set((s) => {
      if (!s.ops[feedId]) return s;
      const ops = { ...s.ops };
      delete ops[feedId];
      return { ops };
    });
  },

  refreshFeed: async (feedId: string) => {
    const states = await getInstallStatus(feedId);
    const found = states.find((s) => s.feed_id === feedId);
    if (found) {
      set((s) => {
        const installMap = { ...s.installMap, [feedId]: found };
        return { installMap, updatable: countUpdatable(installMap) };
      });
    }
  },

  subscribe: async () => {
    if (unlisten) return;
    unlisten = await onDocsetProgress((progress) => {
      const { entries, ops } = get();
      // Solo feeds conocidos: imposible atribuir a otro docset.
      if (!entries.some((e) => e.id === progress.feed_id)) return;
      // FASE 0: solo conteo (el pintado sigue igual que antes).
      if (opOf(ops, progress.feed_id).busy) progressEvents += 1;
      set({ ops: { ...ops, [progress.feed_id]: { ...opOf(ops, progress.feed_id), progress } } });
    });
  },

  unsubscribe: () => {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  },
}));
