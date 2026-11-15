// Inicio de una pestaña vacía. Todo es opcional (Ajustes → Inicio): titular
// con el cursor del logo (`_`), búsqueda grande (abre la paleta), filtros por
// docset, un único bloque de páginas (Recientes | Favoritos, en lista o
// tarjetas), la biblioteca en mosaicos y los atajos de teclado.
// Solo usa los tokens de superficie (`card`, `line`, `ink`…) para verse bien
// en los cuatro estilos, Liquid Glass incluido (ver `.mac-welcome` en CSS).
// Sin docsets: un estado vacío que lleva al catálogo o a elegir carpeta.
import { platform } from "@tauri-apps/plugin-os";
import { useMemo, useState } from "react";
import { useT } from "../hooks/useT";
import { type I18nKey } from "../lib/i18n";
import { relativeParts } from "../lib/recent";
import { usePrefs } from "../store/prefs";
import { useRecent } from "../store/recent";
import { useFavorites } from "../store/favorites";
import { useHistoryUi, type HistoryTab } from "../store/historyUi";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import { CatalogIcon } from "./CatalogIcon";
import { DocsetIcon } from "./DocsetIcon";
import { CloseIcon, FolderIcon, SearchIcon } from "./Icons";

/** Clave del saludo por hora local. */
function greetingKey(hour: number): I18nKey {
  if (hour < 6) return "welcome.night";
  if (hour < 13) return "welcome.morning";
  if (hour < 20) return "welcome.afternoon";
  return "welcome.evening";
}

/** Abre la paleta ya filtrada por un docset (`clave:`), con el cursor al final. */
function openFiltered(key: string): void {
  usePalette.getState().setOpen(true);
  // Tras el foco + selección de apertura: así el texto no queda seleccionado.
  window.setTimeout(() => usePalette.getState().setQuery(`${key}:`), 0);
}

type PageTab = "recent" | "favorites";

/** Una página lista para pintar (reciente o favorita). */
interface PageItem {
  url: string;
  title: string;
  docsetId: string;
  /** Texto secundario tras el docset (p. ej. «hace 2 h»); vacío en favoritos. */
  when: string;
}

function openPage(p: PageItem, newTab: boolean): void {
  void useTabs.getState().openUrl(p.url, p.title, newTab ? { newTab: true } : undefined);
}

/** Clic central = pestaña nueva, sin autoscroll del sistema. */
function middleClick(p: PageItem): {
  onAuxClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
} {
  return {
    onAuxClick: (e) => {
      if (e.button === 1) {
        e.preventDefault();
        openPage(p, true);
      }
    },
    onMouseDown: (e) => {
      if (e.button === 1) e.preventDefault();
    },
  };
}

export function Welcome({ docCount }: { docCount: number }) {
  const setOpen = usePalette((s) => s.setOpen);
  const openCatalogTab = useTabs((s) => s.openCatalogTab);
  const docsets = useDocsets((s) => s.docsets);
  const choose = useDocsets((s) => s.choose);
  const { t } = useT();
  // Símbolo del modificador según plataforma (macOS: ⌘).
  const mod = platform() === "macos" ? "⌘" : "Ctrl";
  const greeting = t(greetingKey(new Date().getHours()));
  const library = [...docsets].sort((a, b) => a.name.localeCompare(b.name));
  const show = usePrefs((s) => s.home);
  const recentPages = useRecent((s) => s.pages);
  const favoritePages = useFavorites((s) => s.pages);
  const hasPages = show.recent || show.favorites;
  const nothing = !show.greeting && !show.search && !show.filters && !hasPages && !show.library && !show.shortcuts;

  const shortcuts: { keys: string[]; label: I18nKey }[] = [
    { keys: [mod, "K"], label: "welcome.search" },
    { keys: [mod, "T"], label: "welcome.newTab" },
    { keys: [mod, "D"], label: "settings.sc.favorite" },
    { keys: [mod, "Y"], label: "sidebar.history" },
  ];

  if (docCount === 0) {
    return (
      <div data-native-scroll className="mac-welcome flex min-h-0 w-full flex-1 overflow-y-auto">
        <div className="m-auto w-full max-w-lg animate-rise-in px-8 py-12 text-center">
          <EmptyShelf />
          <p className="mt-8 text-[13px] font-semibold text-accent-text">{greeting}</p>
          <h1 className="mt-1 heading text-[34px] leading-tight">
            {t("welcome.emptyTitle")}
            <span className="caret-blink text-accent">_</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted">{t("welcome.emptyText")}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={openCatalogTab} className="btn-primary px-4 py-2">
              <CatalogIcon size={15} />
              {t("settings.openCatalog")}
            </button>
            <button type="button" onClick={() => void choose()} className="btn px-4 py-2">
              <FolderIcon size={15} />
              {t("settings.chooseFolder")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const blocks = [
    hasPages ? <PagesBlock key="pages" recentPages={recentPages} favoritePages={favoritePages} /> : null,
    show.library ? <Library key="library" library={library} /> : null,
  ];
  if (show.libraryFirst) blocks.reverse();

  return (
    <div data-native-scroll className="mac-welcome flex min-h-0 w-full flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[44rem] animate-rise-in px-10 pb-12 pt-[min(12vh,6rem)]">
        {nothing && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <span className="heading text-[28px] text-faint">
              OpenDoc<span className="caret-blink text-accent">_</span>
            </span>
            <p className="text-[13px] text-faint">{t("welcome.quiet", { mod })}</p>
          </div>
        )}
        {show.greeting && (
          <div className={show.title === "large" ? "mb-7" : "mb-5"}>
            <p className="text-[13px] font-semibold text-accent-text">{greeting}</p>
            <h1
              className={`mt-1 heading text-ink ${
                show.title === "large" ? "text-[44px] leading-[1.05]" : "text-[26px] leading-tight"
              }`}
            >
              {t("welcome.title")}
              <span className="caret-blink text-accent">_</span>
            </h1>
          </div>
        )}

        {show.search && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("welcome.searchDocs", { mod })}
            className="group flex h-12 w-full items-center gap-3 rounded-2xl border border-line bg-card-2 px-4 text-left transition-all duration-200 ease-smooth hover:border-accent/50 hover:bg-card hover:shadow-[0_0_0_4px_rgb(var(--accent-ch)/0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
          >
            <SearchIcon size={18} className="shrink-0 text-muted transition-colors group-hover:text-accent-text" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-faint">{t("palette.input")}</span>
            <span className="flex shrink-0 gap-1">
              <kbd className="kbd">{mod}</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>
        )}

        {show.filters && library.length > 0 && (
          <div className={`flex flex-wrap items-center gap-x-1 gap-y-1 ${show.search ? "mt-3" : ""}`}>
            <span className="mr-1 text-[12.5px] text-faint">{t("welcome.filterBy")}</span>
            {library.slice(0, 6).map((d) => {
              const key = (d.platform ?? d.id).toLowerCase();
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openFiltered(key)}
                  title={d.name}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[12px] text-muted transition-colors duration-150 hover:bg-ink/[0.06] hover:text-ink"
                >
                  <DocsetIcon icon={d.icon} name={d.name} hint={d.id} size={14} />
                  {key}
                </button>
              );
            })}
          </div>
        )}

        {blocks}

        {show.shortcuts && (
          <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-faint" aria-label={t("welcome.shortcuts")}>
            {shortcuts.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span className="font-medium text-muted">{s.keys.join(" ")}</span>
                {t(s.label)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Recientes | Favoritos en un solo bloque (lista o tarjetas). */
function PagesBlock({
  recentPages,
  favoritePages,
}: {
  recentPages: readonly { url: string; title: string; docsetId: string; at: number }[];
  favoritePages: readonly { url: string; title: string; docsetId: string; at: number }[];
}) {
  const { t, lang } = useT();
  const show = usePrefs((s) => s.home);
  const docsets = useDocsets((s) => s.docsets);
  const byId = useMemo(() => new Map(docsets.map((d) => [d.id, d])), [docsets]);
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(lang, { numeric: "auto" }), [lang]);
  const ago = (at: number): string => {
    const { value, unit } = relativeParts(at, Date.now());
    return value === 0 ? t("welcome.justNow") : rtf.format(value, unit);
  };

  // Solo páginas de docsets cargados.
  const recent: PageItem[] = useMemo(
    () => recentPages.filter((p) => byId.has(p.docsetId)).map((p) => ({ ...p, when: ago(p.at) })),
    [recentPages, byId, lang],
  );
  const favorites: PageItem[] = useMemo(
    () => favoritePages.filter((p) => byId.has(p.docsetId)).map((p) => ({ ...p, when: "" })),
    [favoritePages, byId],
  );

  const both = show.recent && show.favorites;
  // La elección se recuerda (`lastTab`); solo vale mientras esa pestaña siga activada.
  const wanted: PageTab = show.startTab === "last" ? show.lastTab : show.startTab;
  const tab: PageTab = !show.recent ? "favorites" : !show.favorites ? "recent" : wanted;
  const pick = (id: PageTab): void => {
    const prefs = usePrefs.getState();
    prefs.set("home", { ...prefs.home, lastTab: id });
  };
  const items = (tab === "recent" ? recent : favorites).slice(0, show.count);
  const viewAll: HistoryTab = tab === "recent" ? "history" : "favorites";

  const tabs: { id: PageTab; label: string; n: number }[] = [
    { id: "recent", label: t("welcome.recentTab"), n: recent.length },
    { id: "favorites", label: t("welcome.favorites"), n: favorites.length },
  ];

  return (
    <section className="mt-9 first:mt-0" aria-label={t("welcome.pages")}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        {both ? (
          <div role="tablist" aria-label={t("welcome.pages")} className="flex gap-0.5 rounded-lg bg-card-2 p-0.5">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => pick(x.id)}
                className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors duration-150 ${
                  tab === x.id ? "bg-card text-ink shadow-soft" : "text-muted hover:text-ink"
                }`}
              >
                {x.label}
                {x.n > 0 && <span className="ml-1.5 tabular-nums text-faint">{x.n}</span>}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="heading text-[17px]">{tab === "recent" ? t("welcome.recent") : t("welcome.favorites")}</h2>
        )}
        <button
          type="button"
          onClick={() => useHistoryUi.getState().show(viewAll)}
          className="text-[12.5px] font-medium text-muted transition-colors hover:text-accent-text"
        >
          {t("welcome.viewAll")}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          {tab === "recent" ? t("history.empty") : t("welcome.noFavorites")}
        </p>
      ) : show.listStyle === "cards" ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((p, i) => (
            <PageCard key={p.url} page={p} index={i} docset={byId.get(p.docsetId)} />
          ))}
        </ul>
      ) : (
        <ul className="-mx-2.5">
          {items.map((p, i) => (
            <PageRow key={p.url} page={p} index={i} docset={byId.get(p.docsetId)} removable={tab === "favorites"} />
          ))}
        </ul>
      )}
    </section>
  );
}

type DocsetLike = { name: string; icon: string | null } | undefined;

function PageRow({ page, index, docset, removable }: { page: PageItem; index: number; docset: DocsetLike; removable: boolean }) {
  const { t } = useT();
  const name = docset?.name ?? page.docsetId;
  return (
    <li style={{ animationDelay: `${index * 30}ms` }} className="group/row relative animate-rise-in">
      <button
        type="button"
        onClick={() => openPage(page, false)}
        {...middleClick(page)}
        title={page.title}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${removable ? "pr-9" : ""}`}
      >
        <DocsetIcon icon={docset?.icon ?? null} name={name} hint={page.docsetId} size={18} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{page.title}</span>
        <span className="max-w-[45%] shrink-0 truncate text-[12px] text-faint">
          {name}
          {page.when !== "" && ` · ${page.when}`}
        </span>
      </button>
      {removable && (
        <button
          type="button"
          onClick={() => useFavorites.getState().remove(page.url)}
          aria-label={t("favorites.remove")}
          title={t("favorites.remove")}
          className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2 p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
        >
          <CloseIcon size={13} />
        </button>
      )}
    </li>
  );
}

function PageCard({ page, index, docset }: { page: PageItem; index: number; docset: DocsetLike }) {
  const name = docset?.name ?? page.docsetId;
  return (
    <li style={{ animationDelay: `${index * 40}ms` }} className="animate-rise-in">
      <button
        type="button"
        onClick={() => openPage(page, false)}
        {...middleClick(page)}
        title={page.title}
        className="group flex h-full w-full items-start gap-3 rounded-xl border border-line bg-card p-3 text-left transition-colors duration-150 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card-2 ring-1 ring-line">
          <DocsetIcon icon={docset?.icon ?? null} name={name} hint={page.docsetId} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent-text">
            {page.title}
          </span>
          <span className="mt-1 block truncate text-[11.5px] text-faint">
            {name}
            {page.when !== "" && ` · ${page.when}`}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Biblioteca: tus docsets como una nube de nombres con icono, sin tarjetas. */
const LIBRARY_VISIBLE = 12;

function Library({ library }: { library: { id: string; name: string; icon: string | null }[] }) {
  const { t } = useT();
  const openCatalogTab = useTabs((s) => s.openCatalogTab);
  const openHome = useTabs((s) => s.openHome);
  const [all, setAll] = useState(false);
  const overflow = library.length > LIBRARY_VISIBLE;
  const shown = all || !overflow ? library : library.slice(0, LIBRARY_VISIBLE);
  const chip =
    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-ink/[0.05] hover:text-ink";

  return (
    <section className="mt-9 first:mt-0" aria-label={t("sidebar.library")}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="flex items-baseline gap-2 heading text-[17px]">
          {t("sidebar.library")}
          <span className="text-[13px] font-semibold tabular-nums text-faint">{library.length}</span>
        </h2>
        <button
          type="button"
          onClick={openCatalogTab}
          className="text-[12.5px] font-medium text-muted transition-colors hover:text-accent-text"
        >
          {t("welcome.searchCatalog")}
        </button>
      </div>
      <ul className="-mx-2.5 flex flex-wrap gap-y-0.5">
        {shown.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => void openHome(d.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  void openHome(d.id, { newTab: true });
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              title={d.name}
              className={chip}
            >
              <DocsetIcon icon={d.icon} name={d.name} hint={d.id} size={16} />
              {d.name}
            </button>
          </li>
        ))}
        {overflow && (
          <li>
            <button type="button" onClick={() => setAll(!all)} className={`${chip} text-muted`}>
              {all ? t("welcome.showLess") : `+${library.length - LIBRARY_VISIBLE}`}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Ilustración del estado vacío: estantería con libros en los tonos del acento. */
function EmptyShelf() {
  return (
    <svg viewBox="0 0 200 120" className="mx-auto h-28 w-auto" aria-hidden="true">
      <rect x="20" y="104" width="160" height="6" rx="3" className="fill-ink/10" />
      <rect x="44" y="40" width="22" height="64" rx="4" className="fill-accent" />
      <rect x="49" y="50" width="12" height="3" rx="1.5" className="fill-white/70" />
      <rect x="70" y="56" width="18" height="48" rx="4" className="fill-accent/45" />
      <rect x="92" y="30" width="26" height="74" rx="4" className="fill-ink/80" />
      <rect x="98" y="42" width="14" height="3" rx="1.5" className="fill-card/70" />
      <g transform="rotate(14 140 104)">
        <rect x="124" y="44" width="20" height="60" rx="4" className="fill-accent/70" />
      </g>
      <circle cx="160" cy="34" r="5" className="fill-accent/30" />
      <circle cx="34" cy="26" r="3" className="fill-ink/15" />
    </svg>
  );
}
