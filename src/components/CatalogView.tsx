// Vista del catálogo (F3): descubrir, instalar y actualizar docsets.
// Cabecera con título y fuente (repo de feeds, F1, plegable), barra fija
// de búsqueda + filtros con recuento, y cuadrícula de tarjetas unida con
// el estado de instalación (F2). Sin datos inventados: cada tarjeta
// muestra nombre, versiones reales y número de orígenes.
import { useEffect, useMemo, useState } from "react";
import { CatalogIcon } from "./CatalogIcon";
import { CatalogRow } from "./CatalogRow";
import { ErrorDetails } from "./ErrorDetails";
import { CloseIcon, RefreshIcon, SearchIcon } from "./Icons";
import { useT } from "../hooks/useT";
import { useCatalog } from "../store/catalog";
import { useDocsets } from "../store/docsets";
import { formatDateTime, tn, type I18nKey } from "../lib/i18n";
import { filterCatalog } from "../lib/catalogUi";
import type { CatalogFilter, CatalogRowData } from "../lib/catalogUi";
import type { FeedOp } from "../store/catalog";

const FILTERS: { value: CatalogFilter; key: I18nKey }[] = [
  { value: "all", key: "catalog.filterAll" },
  { value: "installed", key: "catalog.filterInstalled" },
  { value: "updatable", key: "catalog.filterUpdatable" },
  { value: "not-installed", key: "catalog.filterNotInstalled" },
];

/** Operación inactiva compartida (no rompe la memoización de filas). */
const IDLE_OP: FeedOp = {
  busy: false,
  progress: null,
  error: null,
  errorKind: "",
  done: false,
};

const GRID = "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]";

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
  const [editingRepo, setEditingRepo] = useState(false);
  const showRepoEditor = editingRepo || !status?.repo || repoError !== null;

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
  const visible = useMemo(() => filterCatalog(rows, query, filter), [rows, query, filter]);
  const counts = useMemo(() => {
    const out = {} as Record<CatalogFilter, number>;
    for (const f of FILTERS) out[f.value] = filterCatalog(rows, query, f.value).length;
    return out;
  }, [rows, query]);
  // Con "Todos", los instalados (o ambiguos) van primero en su sección.
  const sections = useMemo(() => {
    if (filter !== "all") return [{ key: null, rows: visible }];
    const mine = visible.filter((r) => r.status !== null && (r.status.installed || r.status.ambiguous));
    const rest = visible.filter((r) => !mine.includes(r));
    return [
      { key: "catalog.sectionInstalled" as I18nKey, rows: mine },
      { key: "catalog.sectionAvailable" as I18nKey, rows: rest },
    ].filter((s) => s.rows.length > 0);
  }, [visible, filter]);
  // Iconos propios de los instalados; el resto usa el de lenguaje.
  const icons = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const d of docsets) map.set(d.id, d.icon);
    return map;
  }, [docsets]);

  const renderRow = ({ entry, status: st }: CatalogRowData) => (
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
  );

  return (
    <div role="region" className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t("catalog.main")}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Cabecera */}
        <header>
          <div className="mx-auto max-w-6xl px-10 pb-6 pt-10">
            <div className="flex items-end gap-6 border-b-2 border-ink pb-5">
              <div className="min-w-0 flex-1">
                <p className="label flex items-center gap-2 text-accent-text">
                  <CatalogIcon size={13} />
                  {status && status.count > 0
                    ? tn(lang, status.count, "catalog.entriesOne", "catalog.entriesMany", { n: status.count })
                    : t("catalog.title")}
                </p>
                <h2 className="mt-3 text-[2.6rem] font-[380] leading-none tracking-[-0.025em]">{t("catalog.title")}</h2>
                <p className="mt-2.5 max-w-xl text-[16px] italic text-ink-2">{t("catalog.subtitle")}</p>
              </div>
              <button
                onClick={() => void refresh()}
                disabled={refreshing}
                title={t("catalog.refreshTitle")}
                className="btn shrink-0"
              >
                <RefreshIcon size={14} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? t("catalog.refreshing") : t("catalog.refresh")}
              </button>
            </div>

            {/* Fuente (repo de feeds) */}
            <div className="mt-3 font-mono text-[11px]">
              {!showRepoEditor ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
                  <span>{t("catalog.source")}</span>
                  <span className="font-medium text-ink">
                    {status?.repo}
                  </span>
                  <span>· {t("catalog.updated", { date: formatDateTime(lang, status?.fetched_at ?? null) })}</span>
                  {refreshNote && (
                    <span>· {t("catalog.refreshedMany", { count: refreshNote.count, skipped: refreshNote.skipped })}</span>
                  )}
                  <button
                    onClick={() => setEditingRepo(true)}
                    className="ml-1 font-medium text-accent-text underline decoration-accent-text/30 underline-offset-4 hover:decoration-accent-text"
                  >
                    {t("catalog.changeSource")}
                  </button>
                </p>
              ) : (
                <div className="relative mt-2 max-w-xl animate-fade-in border border-rule bg-paper-3 p-4 font-sans">
                  <span aria-hidden className="absolute -inset-y-px -left-px w-[3px] bg-accent" />
                  <div className="flex items-center justify-between">
                    <p className="label">{t("catalog.repoLabel")}</p>
                    {status?.repo && (
                      <button
                        onClick={() => setEditingRepo(false)}
                        aria-label={t("common.close")}
                        className="icon-btn p-1"
                      >
                        <CloseIcon size={13} />
                      </button>
                    )}
                  </div>
                  {!status?.repo && <p className="mt-1.5 text-[14.5px] italic text-ink-2">{t("catalog.setupHelp")}</p>}
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRepo(repoInput).then(() => setEditingRepo(false));
                    }}
                  >
                    <input
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                      placeholder={t("catalog.repoPlaceholder")}
                      aria-label={t("catalog.repoLabel")}
                      className="field min-w-0 flex-1 font-mono text-xs"
                    />
                    <button type="submit" disabled={repoBusy} className="btn-primary shrink-0">
                      {repoBusy ? t("catalog.saving") : t("common.save")}
                    </button>
                  </form>
                  <ErrorDetails error={repoError} />
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Búsqueda y filtros (fijos al hacer scroll) */}
        <div className="sticky top-0 z-10 bg-paper/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-x-8 gap-y-3 border-b border-rule px-10 pb-0 pt-3">
            <label className="relative mb-2.5 min-w-[220px] flex-1">
              <SearchIcon size={16} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("catalog.searchPlaceholder")}
                aria-label={t("catalog.searchLabel")}
                className="w-full border-0 border-b border-transparent bg-transparent py-1.5 pl-7 pr-8 text-[16px] text-ink outline-none placeholder:italic placeholder:text-faint focus-visible:shadow-none"
              />
              {query !== "" && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("common.close")}
                  className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2 p-1"
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </label>
            <div role="radiogroup" aria-label={t("catalog.filterLabel")} className="-mb-px flex gap-5">
              {FILTERS.map(({ value, key }) => {
                const on = filter === value;
                return (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setFilter(value)}
                    className={`flex items-baseline gap-1.5 border-b-2 pb-2.5 pt-1 text-[14.5px] transition-colors duration-150 ease-smooth ${
                      on
                        ? "border-accent text-ink"
                        : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {t(key)}
                    <span
                      className={`font-mono text-[10.5px] tabular-nums ${
                        on ? "text-accent-text" : "text-faint"
                      }`}
                    >
                      {counts[value]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="mx-auto max-w-6xl px-10 py-8">
          {loading ? (
            <ul className={GRID} aria-busy="true" aria-label={t("catalog.loading")}>
              {Array.from({ length: 9 }, (_, i) => (
                <li key={i} className="h-[124px] animate-pulse rounded-[3px] border border-rule bg-paper-3" />
              ))}
            </ul>
          ) : error !== null && entries.length === 0 ? (
            <div className="mx-auto max-w-md py-12 text-center">
              <ErrorDetails error={error} />
              <button onClick={() => void load()} className="btn mt-3">
                {t("catalog.retry")}
              </button>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState text={t("catalog.emptySetup")} />
          ) : visible.length === 0 ? (
            <EmptyState
              text={query.trim() !== "" ? t("catalog.noResultsFor", { query: query.trim() }) : t("catalog.noResults")}
            />
          ) : (
            <div className="space-y-10">
              {sections.map((s) => (
                <section key={s.key ?? "list"}>
                  {s.key && (
                    <h3 className="label mb-4 flex items-center gap-2.5">
                      {t(s.key)}
                      <span className="tabular-nums text-faint">{s.rows.length}</span>
                      <span className="h-px flex-1 bg-rule" />
                    </h3>
                  )}
                  <ul className={GRID}>{s.rows.map(renderRow)}</ul>
                </section>
              ))}
            </div>
          )}
          {error !== null && entries.length > 0 && (
            <div className="mt-4">
              <ErrorDetails error={error} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <CatalogIcon size={28} className="text-faint" />
      <p className="mt-4 max-w-sm text-[17px] italic text-ink-2">{text}</p>
    </div>
  );
}
