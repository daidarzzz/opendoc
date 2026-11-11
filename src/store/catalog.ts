// Slice del catálogo de docsets (F3): datos F1 y operaciones F2.
// - Los datos viven aquí (zustand), no en componentes.
// - El éxito de una instalación lo confirma el `await installDocset`
//   (backend), nunca el evento: ante un error no se muestra éxito.
// - Doble clic: `busy` se fija síncrono antes del primer `await`; si ya
//   está ocupado, la llamada se ignora (el backend además responde
//   `install_in_progress`).
// - El listener de `docset-progress` solo alimenta el progreso visible;
//   la finalización la resuelve la promesa (sigue valiendo aunque el
//   componente se desmonte a mitad de una instalación).
// - Cola: el backend deja descargar a la vez un máximo de instalaciones y
//   el resto espera turno (etapa `queued`). `startedAt` guarda el orden
//   de los clics para el filtro "En cola"; `cancel` quita de la cola una
//   que aún espera (su promesa falla con `install_cancelled` y la tarjeta
//   vuelve a su estado sin mostrar error).
import { create } from "zustand";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  cancelInstall,
  getCatalogStatus,
  getInstallStatus,
  installDocset,
  uninstallDocset,
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
import { errorKindOf } from "../lib/appError";
import type { CatalogFilter } from "../lib/catalogUi";
import { pmark, setProfileEnabled } from "../lib/profile";
import { useDocsets } from "./docsets";

/** Estado de una operación por feed (progreso indexado por feed_id). */
export interface FeedOp {
  busy: boolean;
  progress: DocsetProgress | null;
  error: unknown;
  /** `kind` del ApiError si lo hubo (p. ej. `no_docsets_dir`). */
  errorKind: string;
  done: boolean;
  /** Clic en instalar/actualizar (orden de la cola); `null` en desinstalar. */
  startedAt: number | null;
}

/** Resumen de refresco para traducir al pintar (números sin formatear). */
export interface RefreshNote {
  count: number;
  skipped: number;
}

const idleOp: FeedOp = { busy: false, progress: null, error: null, errorKind: "", done: false, startedAt: null };

interface CatalogState {
  status: CatalogStatus | null;
  entries: FeedEntry[];
  installMap: Record<string, InstallStatus>;
  /** Feeds con `update_available === true` (distintivo de la sidebar). */
  updatable: number;
  loading: boolean;
  refreshing: boolean;
  /** Error global (carga/actualización del catálogo). */
  error: unknown;
  /** Resumen de la última actualización manual. */
  refreshNote: RefreshNote | null;
  query: string;
  filter: CatalogFilter;
  repoInput: string;
  repoBusy: boolean;
  repoError: unknown;
  ops: Record<string, FeedOp>;
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
  uninstall: (feedId: string) => Promise<void>;
  /** Quita de la cola una instalación que aún espera turno. */
  cancel: (feedId: string) => Promise<void>;
  /** Relee el estado de un feed tras operar (confirmación del backend). */
  refreshFeed: (feedId: string) => Promise<void>;
  clearOp: (feedId: string) => void;
  /** Suscribe el progreso. La vista lo pide al montarse y lo libera al
   *  desmontarse; `install` lo mantiene vivo mientras haya descargas. */
  subscribe: (fromView?: boolean) => Promise<void>;
  unsubscribe: () => void;
}

let unlisten: UnlistenFn | null = null;
/** Suscripción en marcha (evita registrar dos listeners a la vez). */
let listening: Promise<void> | null = null;
/** La vista del catálogo está montada. */
let viewMounted = false;
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
  status: null,
  entries: [],
  installMap: {},
  updatable: 0,
  loading: true,
  refreshing: false,
  error: null,
  refreshNote: null,
  query: "",
  filter: "all",
  repoInput: "",
  repoBusy: false,
  repoError: null,
  ops: {},

  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  setRepoInput: (repoInput) => set({ repoInput }),

  load: async () => {
    const mySeq = ++seq;
    set({ loading: true, error: null });
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
      set({ loading: false, error: e });
    }
  },

  saveRepo: async (repo: string) => {
    if (get().repoBusy) return;
    set({ repoBusy: true, repoError: null });
    try {
      await setFeedRepo(repo);
      const status = await getCatalogStatus();
      set({ status, repoInput: status.repo ?? "", repoBusy: false });
      await get().load();
    } catch (e) {
      set({ repoBusy: false, repoError: e });
    }
  },

  refresh: async () => {
    if (get().refreshing) return;
    set({ refreshing: true, error: null, refreshNote: null });
    try {
      const summary = await refreshCatalog();
      set({
        refreshNote: { count: summary.count, skipped: summary.skipped },
      });
      await get().load();
    } catch (e) {
      // La caché anterior se conserva: se muestra el error con los datos.
      set({ error: e });
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
        [feedId]: { busy: true, progress: null, error: null, errorKind: "", done: false, startedAt: Date.now() },
      },
    }));
    // El progreso (y el aviso de "en cola") se sigue aunque se salga del
    // catálogo mientras descarga.
    void get().subscribe(false);
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
      const errorKind = errorKindOf(e);
      // Quitada de la cola a propósito: no es un fallo, la tarjeta vuelve
      // a su estado normal.
      if (errorKind === "install_cancelled") {
        get().clearOp(feedId);
        return; // `finally` libera el listener si ya no hace falta.
      }
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
        ops: { ...s.ops, [feedId]: { ...opOf(s.ops, feedId), busy: false, error: e, errorKind } },
      }));
    } finally {
      releaseIfIdle();
    }
  },

  uninstall: async (feedId: string) => {
    if (opOf(get().ops, feedId).busy) return;
    set((s) => ({
      ops: {
        ...s.ops,
        [feedId]: { ...opOf(s.ops, feedId), busy: true, error: null, errorKind: "", done: false, startedAt: null },
      },
    }));
    try {
      await uninstallDocset(feedId);
      await useDocsets.getState().refresh();
      await get().refreshFeed(feedId);
      set((s) => ({
        ops: { ...s.ops, [feedId]: { ...opOf(s.ops, feedId), busy: false } },
      }));
    } catch (e) {
      set((s) => ({
        ops: {
          ...s.ops,
          [feedId]: {
            ...opOf(s.ops, feedId),
            busy: false,
            error: e,
            errorKind: errorKindOf(e),
          },
        },
      }));
    }
  },

  cancel: async (feedId: string) => {
    const op = opOf(get().ops, feedId);
    if (!op.busy || op.progress?.stage !== "queued") return;
    try {
      // Si ya le tocó el turno, devuelve false y la descarga sigue.
      await cancelInstall(feedId);
    } catch {
      // Sin cambios: la instalación sigue su curso y la promesa lo dirá.
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

  subscribe: async (fromView = true) => {
    if (fromView) viewMounted = true;
    if (unlisten) return;
    listening ??= onDocsetProgress((progress) => {
      const { entries, ops } = get();
      // Solo feeds conocidos: imposible atribuir a otro docset.
      if (!entries.some((e) => e.id === progress.feed_id)) return;
      // FASE 0: solo conteo (el pintado sigue igual que antes).
      if (opOf(ops, progress.feed_id).busy) progressEvents += 1;
      set({ ops: { ...ops, [progress.feed_id]: { ...opOf(ops, progress.feed_id), progress } } });
    }).then(
      (fn) => {
        unlisten = fn;
        listening = null;
        releaseIfIdle();
      },
      () => {
        listening = null;
      },
    );
    await listening;
  },

  unsubscribe: () => {
    viewMounted = false;
    releaseIfIdle();
  },
}));

/** Suelta el listener de progreso si nadie lo necesita (vista cerrada y
 *  ninguna instalación en marcha). */
function releaseIfIdle(): void {
  if (viewMounted || !unlisten) return;
  if (Object.values(useCatalog.getState().ops).some((op) => op.busy)) return;
  unlisten();
  unlisten = null;
}
