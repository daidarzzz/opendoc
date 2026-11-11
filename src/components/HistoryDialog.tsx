// Panel de Historial: todas las páginas leídas (máx. 200), agrupadas por
// día, con buscador, quitar una a una y borrar todo. Se abre desde
// «Seguir leyendo» en el inicio (ver `store/historyUi`).
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../hooks/useT";
import { tn, type I18nKey } from "../lib/i18n";
import { filterRecent, groupByDay, type DayGroup, type RecentPage } from "../lib/recent";
import { useDocsets } from "../store/docsets";
import { useHistoryUi } from "../store/historyUi";
import { useRecent } from "../store/recent";
import { useTabs } from "../store/tabs";
import { DocsetIcon } from "./DocsetIcon";
import { ClockIcon, CloseIcon, SearchIcon, TrashIcon } from "./Icons";

const GROUP_KEY: Record<DayGroup, I18nKey> = {
  today: "history.today",
  yesterday: "history.yesterday",
  week: "history.week",
  older: "history.older",
};

export function HistoryDialog() {
  const open = useHistoryUi((s) => s.open);
  if (!open) return null;
  return <HistoryPanel />;
}

function HistoryPanel() {
  const { t, lang } = useT();
  const close = useHistoryUi((s) => s.close);
  const pages = useRecent((s) => s.pages);
  const docsets = useDocsets((s) => s.docsets);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(docsets.map((d) => [d.id, d])), [docsets]);
  const name = (id: string): string => byId.get(id)?.name ?? id;
  const visible = useMemo(() => filterRecent(pages, query, (id) => byId.get(id)?.name ?? id), [pages, query, byId]);
  const groups = useMemo(() => groupByDay(visible, Date.now()), [visible]);

  const time = useMemo(() => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }), [lang]);
  const weekday = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "long", hour: "2-digit", minute: "2-digit" }), [lang]);
  const date = useMemo(() => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }), [lang]);
  const when = (g: DayGroup, at: number): string =>
    g === "today" || g === "yesterday" ? time.format(at) : g === "week" ? weekday.format(at) : date.format(at);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const openPage = (p: RecentPage, newTab: boolean): void => {
    void useTabs.getState().openUrl(p.url, p.title, { newTab });
    if (!newTab) close();
  };

  return (
    <div className="backdrop z-40 items-center" onClick={close} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("history.title")}
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
            <ClockIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <h2 className="heading text-[24px] leading-tight">{t("history.title")}</h2>
              <span className="text-[12.5px] font-semibold tabular-nums text-faint">
                {tn(lang, pages.length, "history.countOne", "history.countMany", { n: pages.length })}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">{t("history.subtitle")}</p>
          </div>
          <button aria-label={t("common.close")} title={t("common.close")} onClick={close} className="icon-btn -mr-2">
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="px-7 pb-3">
          <label className="relative block">
            <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("history.search")}
              aria-label={t("history.search")}
              className="field w-full rounded-xl bg-card-2 py-2 pl-10 pr-3"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {pages.length === 0 ? (
            <Empty text={t("history.empty")} />
          ) : groups.length === 0 ? (
            <Empty text={t("history.noMatch", { query: query.trim() })} />
          ) : (
            groups.map(({ group, pages: list }) => (
              <section key={group} className="mt-3 first:mt-1">
                <h3 className="label sticky top-0 z-[1] bg-card px-3 py-2">{t(GROUP_KEY[group])}</h3>
                <ul>
                  {list.map((p, i) => {
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
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card-2 ring-1 ring-line transition-transform duration-200 ease-smooth group-hover/row:scale-105">
                            <DocsetIcon icon={d?.icon ?? null} name={name(p.docsetId)} hint={p.docsetId} size={19} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-ink transition-colors group-hover/row:text-accent-text">
                              {p.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-faint">{name(p.docsetId)}</span>
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-faint">{when(group, p.at)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => useRecent.getState().remove(p.url)}
                          aria-label={t("history.remove")}
                          title={t("history.remove")}
                          className="icon-btn shrink-0 p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
                        >
                          <CloseIcon size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
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
                useRecent.getState().clear();
              }}
              className={confirming ? "btn-danger" : "btn"}
            >
              <TrashIcon size={14} />
              {confirming ? t("history.confirmClear") : t("history.clear")}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent-text">
        <ClockIcon size={22} />
      </div>
      <p className="max-w-xs text-[13.5px] text-muted">{text}</p>
    </div>
  );
}
