// Inicio de una pestaña vacía: saludo según la hora, titular con el cursor
// del logo (`_`), búsqueda grande (abre la paleta), atajos a cada docset
// como filtro, la biblioteca en mosaicos y los atajos de teclado.
// Sin docsets: un estado vacío que lleva al catálogo o a elegir carpeta.
import { platform } from "@tauri-apps/plugin-os";
import { useMemo } from "react";
import { useT } from "../hooks/useT";
import { type I18nKey } from "../lib/i18n";
import { relativeParts } from "../lib/recent";
import { usePrefs } from "../store/prefs";
import { useRecent } from "../store/recent";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import { CatalogIcon } from "./CatalogIcon";
import { DocsetIcon } from "./DocsetIcon";
import { FolderIcon, PlusIcon, SearchIcon } from "./Icons";

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

export function Welcome({ docCount }: { docCount: number }) {
  const setOpen = usePalette((s) => s.setOpen);
  const openCatalogTab = useTabs((s) => s.openCatalogTab);
  const openHome = useTabs((s) => s.openHome);
  const docsets = useDocsets((s) => s.docsets);
  const choose = useDocsets((s) => s.choose);
  const { t, lang } = useT();
  // Símbolo del modificador según plataforma (macOS: ⌘).
  const mod = platform() === "macos" ? "⌘" : "Ctrl";
  const greeting = t(greetingKey(new Date().getHours()));
  const library = [...docsets].sort((a, b) => a.name.localeCompare(b.name));
  const show = usePrefs((s) => s.home);
  const pages = useRecent((s) => s.pages);
  const byId = useMemo(() => new Map(docsets.map((d) => [d.id, d])), [docsets]);
  // Solo páginas de docsets cargados; las 6 más recientes.
  const recent = useMemo(() => pages.filter((p) => byId.has(p.docsetId)).slice(0, 6), [pages, byId]);
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(lang, { numeric: "auto" }), [lang]);
  const ago = (at: number): string => {
    const { value, unit } = relativeParts(at, Date.now());
    return value === 0 ? t("welcome.justNow") : rtf.format(value, unit);
  };
  const nothing = !show.greeting && !show.search && !show.filters && !(show.recent && recent.length > 0) && !show.library && !show.shortcuts;

  const shortcuts: { keys: string[]; label: I18nKey }[] = [
    { keys: [mod, "K"], label: "welcome.search" },
    { keys: [mod, "T"], label: "welcome.newTab" },
    { keys: [mod, "F"], label: "settings.sc.find" },
    { keys: ["F3"], label: "settings.sc.catalog" },
    { keys: [mod, ","], label: "settings.sc.settings" },
  ];

  if (docCount === 0) {
    return (
      <div className="flex min-h-0 w-full flex-1 overflow-y-auto">
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

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[46rem] animate-rise-in px-10 pb-12 pt-[min(12vh,6rem)]">
        {nothing && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <span className="heading text-[28px] text-faint">
              OpenDoc<span className="caret-blink text-accent">_</span>
            </span>
            <p className="text-[13px] text-faint">{t("welcome.quiet", { mod })}</p>
          </div>
        )}
        {show.greeting && (
          <div className="mb-7">
            <p className="text-[13px] font-semibold text-accent-text">{greeting}</p>
            <h1 className="mt-1 heading text-[44px] leading-[1.05] text-ink">
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
          className="group flex h-14 w-full items-center gap-3 rounded-2xl border border-line bg-card-2 px-5 text-left transition-all duration-200 ease-smooth hover:border-accent/50 hover:bg-card hover:shadow-[0_0_0_4px_rgb(var(--accent-ch)/0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
        >
          <SearchIcon size={19} className="shrink-0 text-muted transition-colors group-hover:text-accent-text" />
          <span className="min-w-0 flex-1 truncate text-[16px] text-faint">{t("palette.input")}</span>
          <span className="flex shrink-0 gap-1">
            <kbd className="kbd">{mod}</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
        )}

        {show.filters && library.length > 0 && (
          <div className={`flex flex-wrap items-center gap-1.5 ${show.search ? "mt-3" : ""}`}>
            <span className="mr-1 text-[12.5px] text-muted">{t("welcome.filterBy")}</span>
            {library.slice(0, 6).map((d) => {
              const key = (d.platform ?? d.id).toLowerCase();
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openFiltered(key)}
                  title={d.name}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pl-1 pr-2.5 font-mono text-[11.5px] text-ink-2 transition-all duration-150 hover:border-accent/40 hover:text-accent-text"
                >
                  <DocsetIcon icon={d.icon} name={d.name} hint={d.id} size={15} />
                  {key}:
                </button>
              );
            })}
          </div>
        )}

        {show.recent && recent.length > 0 && (
          <section className="mt-12 first:mt-0" aria-label={t("welcome.recent")}>
            <h2 className="mb-3 heading text-[19px]">{t("welcome.recent")}…</h2>
            <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
              {recent.map((p, i) => {
                const d = byId.get(p.docsetId);
                return (
                  <li key={p.url} style={{ animationDelay: `${i * 40}ms` }} className="animate-rise-in">
                    <button
                      type="button"
                      onClick={() => void useTabs.getState().openUrl(p.url, p.title)}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          void useTabs.getState().openUrl(p.url, p.title, { newTab: true });
                        }
                      }}
                      onMouseDown={(e) => {
                        if (e.button === 1) e.preventDefault();
                      }}
                      title={p.title}
                      className="group relative flex h-full w-full items-start gap-3 overflow-hidden rounded-xl border border-line bg-card p-3 text-left transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-float"
                    >
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 bg-accent transition-transform duration-300 ease-smooth group-hover:scale-y-100" />
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card-2 ring-1 ring-line">
                        <DocsetIcon icon={d?.icon ?? null} name={d?.name ?? p.docsetId} hint={p.docsetId} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent-text">
                          {p.title}
                        </span>
                        <span className="mt-1 block truncate text-[11.5px] text-faint">
                          {d?.name ?? p.docsetId} · {ago(p.at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {show.library && (
        <section className="mt-12 first:mt-0" aria-label={t("sidebar.library")}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="flex items-baseline gap-2 heading text-[19px]">
              {t("sidebar.library")}
              <span className="text-[13px] font-semibold tabular-nums text-faint">{library.length}</span>
            </h2>
            <button
              type="button"
              onClick={openCatalogTab}
              className="text-[12.5px] font-medium text-accent-text transition-opacity hover:opacity-80"
            >
              {t("welcome.searchCatalog")} →
            </button>
          </div>
          <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {library.map((d) => (
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
                  className="group flex h-full w-full flex-col items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-ink/15 hover:shadow-float"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-card-2 ring-1 ring-line transition-transform duration-200 ease-smooth group-hover:scale-105">
                    <DocsetIcon icon={d.icon} name={d.name} hint={d.id} size={24} />
                  </span>
                  <span className="w-full min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{d.name}</span>
                    <span className="mt-0.5 block h-4 truncate font-mono text-[10.5px] text-faint">{d.version ?? ""}</span>
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={openCatalogTab}
                className="group flex h-full w-full flex-col items-start gap-3 rounded-xl border border-dashed border-ink/15 p-3.5 text-left transition-all duration-200 ease-smooth hover:border-accent/50 hover:bg-accent/[0.04]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-text transition-transform duration-200 ease-smooth group-hover:scale-105">
                  <PlusIcon size={18} />
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-ink">{t("welcome.addDocsets")}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted">{t("welcome.addDocsetsHint")}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
        )}

        {show.shortcuts && (
        <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5" aria-label={t("welcome.shortcuts")}>
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <span className="flex gap-0.5">
                {s.keys.map((k) => (
                  <kbd key={k} className="kbd h-[18px] min-w-[18px] px-1 text-[10px]">
                    {k}
                  </kbd>
                ))}
              </span>
              {t(s.label)}
            </li>
          ))}
        </ul>
        )}
      </div>
    </div>
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
