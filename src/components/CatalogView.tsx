// Vista del catálogo (F3): descubrir, instalar y actualizar docsets.
// Cabecera con el repo de feeds (F1), buscador + filtro por estado y
// lista unida con el estado de instalación (F2). Sin datos inventados:
// cada fila muestra nombre, versiones reales y número de orígenes.
import { useEffect, useMemo } from "react";
import { CatalogRow } from "./CatalogRow";
import { useCatalog } from "../store/catalog";
import { useDocsets } from "../store/docsets";
import {
  filterCatalog,
  formatFetchedAt,
} from "../lib/catalogUi";
import type { CatalogFilter, CatalogRowData } from "../lib/catalogUi";
import type { FeedOp } from "../store/catalog";

const FILTER_LABEL: Record<CatalogFilter, string> = {
  all: "Todos",
  installed: "Instalados",
  "not-installed": "No instalados",
  updatable: "Actualizables",
};

/** Operación inactiva compartida (no rompe la memoización de filas). */
const IDLE_OP: FeedOp = {
  busy: false,
  progress: null,
  error: "",
  errorKind: "",
  done: false,
};

export function CatalogView() {
  const status = useCatalog((s) => s.status);
  const entries = useCatalog((s) => s.entries);
  const installMap = useCatalog((s) => s.installMap);
  const loading = useCatalog((s) => s.loading);
  const refreshing = useCatalog((s) => s.refreshing);
  const error = useCatalog((s) => s.error);
  const refreshNote = useCatalog((s) => s.refreshNote);
  const query = useCatalog((s) => s.query);
  const filter = useCatalog((s) => s.filter);
  const repoInput = useCatalog((s) => s.repoInput);
  const repoBusy = useCatalog((s) => s.repoBusy);
  const repoError = useCatalog((s) => s.repoError);
  const ops = useCatalog((s) => s.ops);
  const showViewer = useCatalog((s) => s.showViewer);
  const load = useCatalog((s) => s.load);
  const saveRepo = useCatalog((s) => s.saveRepo);
  const refresh = useCatalog((s) => s.refresh);
  const install = useCatalog((s) => s.install);
  const uninstall = useCatalog((s) => s.uninstall);
  const clearOp = useCatalog((s) => s.clearOp);
  const setQuery = useCatalog((s) => s.setQuery);
  const setFilter = useCatalog((s) => s.setFilter);
  const setRepoInput = useCatalog((s) => s.setRepoInput);
  const choose = useDocsets((s) => s.choose);
  const docsets = useDocsets((s) => s.docsets);

  // Progreso en vivo; se libera al desmontar (al volver al visor).
  // La carga la dispara `open()` del store; aquí solo el listener.
  useEffect(() => {
    const state = useCatalog.getState();
    void state.subscribe();
    return () => useCatalog.getState().unsubscribe();
  }, []);

  const rows: CatalogRowData[] = useMemo(
    () => entries.map((entry) => ({ entry, status: installMap[entry.id] ?? null })),
    [entries, installMap],
  );
  const visible = useMemo(
    () => filterCatalog(rows, query, filter),
    [rows, query, filter],
  );
  // Iconos de los instalados (propio o Devicon vía backend); los no
  // instalados usan el genérico de `DocsetIcon`.
  const icons = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const d of docsets) map.set(d.id, d.icon);
    return map;
  }, [docsets]);

  return (
    <main
      className="flex min-w-0 flex-1 flex-col"
      aria-label="Catálogo de docsets"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 p-3 dark:border-gray-800">
        <button
          onClick={showViewer}
          title="Volver al visor"
          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ← Visor
        </button>
        <h2 className="text-sm font-semibold">Catálogo</h2>
        {status && status.count > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {status.count} entradas
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          title="Descargar de nuevo el catálogo"
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div className="border-b border-gray-200 p-3 text-xs dark:border-gray-800">
        <p className="text-gray-500 dark:text-gray-400">
          Repo:{" "}
          <span className="font-mono">
            {status?.repo ?? "sin configurar"}
          </span>{" "}
          · actualizado: {formatFetchedAt(status?.fetched_at ?? null)}
          {refreshNote !== "" && <span> · {refreshNote}</span>}
        </p>
        {!status?.repo && (
          <p className="mt-1 text-gray-600 dark:text-gray-300">
            Configura el repositorio de feeds (owner/repo o URL de GitHub)
            para descargar el catálogo.
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo o URL de GitHub"
            aria-label="Repositorio de feeds"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            onClick={() => void saveRepo(repoInput)}
            disabled={repoBusy}
            className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {repoBusy ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {repoError !== "" && (
          <p className="mt-1 text-red-600 dark:text-red-400">{repoError}</p>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200 p-3 dark:border-gray-800">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar docsets…"
          aria-label="Buscar docsets"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <select
          value={filter}
          onChange={(e) => {
            const value = e.target.value;
            if (value in FILTER_LABEL) setFilter(value as CatalogFilter);
          }}
          aria-label="Filtrar por estado"
          className="shrink-0 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {Object.entries(FILTER_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="text-sm text-gray-500">Cargando catálogo…</p>
        ) : error !== "" && entries.length === 0 ? (
          <div className="text-sm">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Reintentar
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">
            Catálogo vacío: configura el repo y pulsa Actualizar.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin resultados{query.trim() !== "" && ` para «${query.trim()}»`}.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map(({ entry, status: st }) => (
              <CatalogRow
                key={entry.id}
                entry={entry}
                status={st}
                icon={st?.docset_id ? (icons.get(st.docset_id) ?? null) : null}
                op={ops[entry.id] ?? IDLE_OP}
                onAction={(feedId, force) => void install(feedId, force)}
                onUninstall={(feedId) => void uninstall(feedId)}
                onDismiss={(feedId) => clearOp(feedId)}
                onChooseFolder={() => void choose()}
              />
            ))}
          </ul>
        )}
        {error !== "" && entries.length > 0 && (
          <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
