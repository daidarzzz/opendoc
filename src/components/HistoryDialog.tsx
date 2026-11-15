// Panel de Historial y Favoritos. Historial: todas las páginas leídas
// (máx. 200), agrupadas por día. Favoritos: las páginas marcadas con
// estrella. Ambos con buscador, quitar una a una y borrar todo. Se abre
// desde el inicio, la barra lateral o Ctrl/Cmd+Y (ver `store/historyUi`).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "../hooks/useT";
import { filterFavorites } from "../lib/favorites";
import { tn, type I18nKey } from "../lib/i18n";
import { filterRecent, groupByDay, type DayGroup } from "../lib/recent";
import { useDocsets } from "../store/docsets";
import { useFavorites } from "../store/favorites";
import { useHistoryUi, type HistoryTab } from "../store/historyUi";
import { useRecent } from "../store/recent";
import { useTabs } from "../store/tabs";
import { DocsetIcon } from "./DocsetIcon";
import { ClockIcon, CloseIcon, SearchIcon, StarIcon, TrashIcon } from "./Icons";

const GROUP_KEY: Record<DayGroup, I18nKey> = {
  today: "history.today",
  yesterday: "history.yesterday",
  week: "history.week",
  older: "history.older",
};

interface Row {
  url: string;
  title: string;
  docsetId: string;
  at: number;
}

export function HistoryDialog() {
  const open = useHistoryUi((s) => s.open);
  if (!open) return null;
  return <HistoryPanel />;
}

function HistoryPanel() {
  const { t, lang } = useT();
  const close = useHistoryUi((s) => s.close);
  const tab = useHistoryUi((s) => s.tab);
  const setTab = useHistoryUi((s) => s.setTab);
  const recent = useRecent((s) => s.pages);
  const favorites = useFavorites((s) => s.pages);
  const docsets = useDocsets((s) => s.docsets);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isHistory = tab === "history";
  const pages = isHistory ? recent : favorites;
  const byId = useMemo(() => new Map(docsets.map((d) => [d.id, d])), [docsets]);
  const name = (id: string): string => byId.get(id)?.name ?? id;
  const visible: Row[] = useMemo(
    () => (isHistory ? filterRecent(recent, query, (id) => byId.get(id)?.name ?? id) : filterFavorites(favorites, query, (id) => byId.get(id)?.name ?? id)),
    [isHistory, recent, favorites, query, byId],
  );
  const groups = useMemo(() => (isHistory ? groupByDay(visible, Date.now()) : []), [isHistory, visible]);

  const time = useMemo(() => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }), [lang]);
  const weekday = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "long", hour: "2-digit", minute: "2-digit" }), [lang]);
  const date = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }), [lang]);
  const when = (g: DayGroup, at: number): string =>
    g === "today" || g === "yesterday" ? time.format(at) : g === "week" ? weekday.format(at) : date.format(at);

  useEffect(() => {
    inputRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    setConfirming(false);
  }, [tab]);

  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const openPage = (p: Row, newTab: boolean): void => {
    void useTabs.getState().openUrl(p.url, p.title, { newTab });
    if (!newTab) close();
  };

  const remove = (url: string): void => {
    if (isHistory) useRecent.getState().remove(url);
    else useFavorites.getState().remove(url);
  };

  const renderRow = (p: Row, i: number, trailing: string): ReactNode => {
    const d = byId.get(p.docsetId);
    return (
      <li
        key={p.url}
        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
        className="group/row relative flex animate-rise-in items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-card-2"
      >
        <button
          type="button"
          onClick={() => openPage(p, false)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              openPage(p, true);
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          title={p.title}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card-2 ring-1 ring-line">
            <DocsetIcon icon={d?.icon ?? null} name={name(p.docsetId)} hint={p.docsetId} size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-ink transition-colors group-hover/row:text-accent-text">
              {p.title}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-faint">{name(p.docsetId)}</span>
          </span>
          {trailing !== "" && <span className="shrink-0 text-[12px] tabular-nums text-faint">{trailing}</span>}
        </button>
        <button
          type="button"
          onClick={() => remove(p.url)}
          aria-label={isHistory ? t("history.remove") : t("favorites.remove")}
          title={isHistory ? t("history.remove") : t("favorites.remove")}
          className="icon-btn shrink-0 p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          <CloseIcon size={13} />
        </button>
      </li>
    );
  };

  const tabs: { id: HistoryTab; label: string }[] = [
    { id: "history", label: t("history.title") },
    { id: "favorites", label: t("favorites.title") },
  ];

  return (
    <div className="backdrop z-40 items-center" onClick={close} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={isHistory ? t("history.title") : t("favorites.title")}
        className="surface flex h-[min(640px,calc(100vh-2rem))] w-[min(760px,100%)] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <header className="flex items-start gap-4 px-7 pb-4 pt-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/[0.12] text-accent-text">
            {isHistory ? <ClockIcon size={22} /> : <StarIcon size={22} filled />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <h2 className="heading text-[24px] leading-tight">{isHistory ? t("history.title") : t("favorites.title")}</h2>
              <span className="text-[12.5px] font-semibold tabular-nums text-faint">
                {isHistory
                  ? tn(lang, pages.length, "history.countOne", "history.countMany", { n: pages.length })
                  : tn(lang, pages.length, "favorites.countOne", "favorites.countMany", { n: pages.length })}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">{isHistory ? t("history.subtitle") : t("favorites.subtitle")}</p>
          </div>
          <button aria-label={t("common.close")} title={t("common.close")} onClick={close} className="icon-btn -mr-2">
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="flex items-center gap-3 px-7 pb-3">
          <div role="tablist" aria-label={t("welcome.pages")} className="flex shrink-0 gap-0.5 rounded-lg bg-card-2 p-0.5">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => {
                  setTab(x.id);
                  setQuery("");
                }}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ${
                  tab === x.id ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 flex-1">
            <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isHistory ? t("history.search") : t("favorites.search")}
              aria-label={isHistory ? t("history.search") : t("favorites.search")}
              className="field w-full rounded-xl bg-card-2 py-2 pl-10 pr-3"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {pages.length === 0 ? (
            <Empty favorites={!isHistory} text={isHistory ? t("history.empty") : t("favorites.empty")} />
          ) : visible.length === 0 ? (
            <Empty
              favorites={!isHistory}
              text={(isHistory ? t("history.noMatch", { query: query.trim() }) : t("favorites.noMatch", { query: query.trim() }))}
            />
          ) : isHistory ? (
            groups.map(({ group, pages: list }) => (
              <section key={group} className="mt-3 first:mt-1">
                <h3 className="label sticky top-0 z-[1] bg-card px-3 py-2">{t(GROUP_KEY[group])}</h3>
                <ul>{list.map((p, i) => renderRow(p, i, when(group, p.at)))}</ul>
              </section>
            ))
          ) : (
            <ul className="mt-1">{visible.map((p, i) => renderRow(p, i, ""))}</ul>
          )}
        </div>

        {pages.length > 0 && (
          <footer className="flex items-center justify-between border-t border-line bg-card-2 px-7 py-3">
            <button
              type="button"
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setConfirming(false);
                if (isHistory) useRecent.getState().clear();
                else useFavorites.getState().clear();
              }}
              className={confirming ? "btn-danger" : "btn"}
            >
              <TrashIcon size={14} />
              {confirming
                ? isHistory
                  ? t("history.confirmClear")
                  : t("favorites.confirmClear")
                : isHistory
                  ? t("history.clear")
                  : t("favorites.clear")}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function Empty({ text, favorites }: { text: string; favorites: boolean }) {
  return (
    <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent-text">
        {favorites ? <StarIcon size={22} /> : <ClockIcon size={22} />}
      </div>
      <p className="max-w-xs text-[13.5px] text-muted">{text}</p>
    </div>
  );
}
