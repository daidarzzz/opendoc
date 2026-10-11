// Vista del catálogo (F3): descubrir, instalar y actualizar docsets.
// Cabecera con el repo de feeds (F1), buscador + filtro por estado y
// lista unida con el estado de instalación (F2). Sin datos inventados:
// cada fila muestra nombre, versiones reales y número de orígenes.
import { useEffect, useMemo } from "react";
import { CatalogRow } from "./CatalogRow";
import { ErrorDetails } from "./ErrorDetails";
import { useT } from "../hooks/useT";
import { useCatalog } from "../store/catalog";
import { useDocsets } from "../store/docsets";
import { formatDateTime, tn, type I18nKey } from "../lib/i18n";
import { filterCatalog } from "../lib/catalogUi";
import type { CatalogFilter, CatalogRowData } from "../lib/catalogUi";
import type { FeedOp } from "../store/catalog";

const FILTER_KEYS: Record<CatalogFilter, I18nKey> = {
  all: "catalog.filterAll",
  installed: "catalog.filterInstalled",
  "not-installed": "catalog.filterNotInstalled",
  updatable: "catalog.filterUpdatable",
};

/** Operación inactiva compartida (no rompe la memoización de filas). */
const IDLE_OP: FeedOp = {
  busy: false,
  progress: null,
  error: null,
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
  const { t, lang } = useT();

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
      aria-label={t("catalog.main")}
    >
      <div className="flex items-center gap-2 border-b border-gray-200 p-3 dark:border-gray-800">
        <button
          onClick={showViewer}
          title={t("catalog.backToViewer")}
          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ← {t("catalog.viewer")}
        </button>
        <h2 className="text-sm font-semibold">{t("catalog.title")}</h2>
        {status && status.count > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {tn(lang, status.count, "catalog.entriesOne", "catalog.entriesMany", { n: status.count })}
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          title={t("catalog.refreshTitle")}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {refreshing ? t("catalog.refreshing") : t("catalog.refresh")}
        </button>
      </div>

      <div className="border-b border-gray-200 p-3 text-xs dark:border-gray-800">
        <p className="text-gray-500 dark:text-gray-400">
          {t("catalog.repo")}{" "}
          <span className="font-mono">
            {status?.repo ?? t("catalog.notConfigured")}
          </span>{" "}
          {t("catalog.updatedAt", { date: formatDateTime(lang, status?.fetched_at ?? null) })}
          {refreshNote && (
            <span> · {t("catalog.refreshedMany", { count: refreshNote.count, skipped: refreshNote.skipped })}</span>
          )}
        </p>
        {!status?.repo && (
          <p className="mt-1 text-gray-600 dark:text-gray-300">
            {t("catalog.setupHelp")}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder={t("catalog.repoPlaceholder")}
            aria-label={t("catalog.repoLabel")}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            onClick={() => void saveRepo(repoInput)}
            disabled={repoBusy}
            className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {repoBusy ? t("catalog.saving") : t("common.save")}
          </button>
        </div>
        <ErrorDetails error={repoError} />
      </div>

      <div className="flex gap-2 border-b border-gray-200 p-3 dark:border-gray-800">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("catalog.searchPlaceholder")}
          aria-label={t("catalog.searchLabel")}
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <select
          value={filter}
          onChange={(e) => {
            const value = e.target.value;
            if (value in FILTER_KEYS) setFilter(value as CatalogFilter);
          }}
          aria-label={t("catalog.filterLabel")}
          className="shrink-0 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {Object.entries(FILTER_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t(key)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="text-sm text-gray-500">{t("catalog.loading")}</p>
        ) : error !== null && entries.length === 0 ? (
          <div className="text-sm">
            <ErrorDetails error={error} />
            <button
              onClick={() => void load()}
              className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              {t("catalog.retry")}
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t("catalog.emptySetup")}
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">
            {query.trim() !== "" ? t("catalog.noResultsFor", { query: query.trim() }) : t("catalog.noResults")}.
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
        {error !== null && entries.length > 0 && (
          <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
            <ErrorDetails error={error} />
          </div>
        )}
      </div>
    </main>
  );
}
