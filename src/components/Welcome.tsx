// Página de bienvenida de pestaña vacía: una portada. Titular, línea de
// búsqueda (abre la paleta), índice de atajos con guías de puntos y una
// entrada de diccionario para el filtro por docset.
import { platform } from "@tauri-apps/plugin-os";
import { useT } from "../hooks/useT";
import { tn, type I18nKey } from "../lib/i18n";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import { AppLogo } from "./AppLogo";
import { SearchIcon } from "./Icons";

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-baseline gap-2 py-[7px]">
      <span className="text-[15px] text-ink-2">{label}</span>
      <span aria-hidden className="min-w-[1.5rem] flex-1 -translate-y-1 border-b-[1.5px] border-dotted border-ink/20" />
      <span className="flex shrink-0 gap-1">
        {keys.map((k) => (
          <kbd key={k} className="kbd">
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}

export function Welcome({ docCount }: { docCount: number }) {
  const setOpen = usePalette((s) => s.setOpen);
  const openCatalogTab = useTabs((s) => s.openCatalogTab);
  const { t, lang } = useT();
  // Símbolo del modificador según plataforma (macOS: ⌘).
  const mod = platform() === "macos" ? "⌘" : "Ctrl";

  const shortcuts: { keys: string[]; label: I18nKey }[] = [
    { keys: [mod, "K"], label: "welcome.search" },
    { keys: [mod, "T"], label: "welcome.newTab" },
    { keys: [mod, "W"], label: "welcome.closeTab" },
    { keys: [mod, "F"], label: "settings.sc.find" },
    { keys: [mod, ","], label: "settings.sc.settings" },
  ];

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-y-auto">
      <div className="m-auto w-full max-w-[35rem] animate-rise-in px-6 py-8">
        <div className="flex items-center gap-2.5">
          <AppLogo size={22} />
          <span className="label text-accent-text">{t("welcome.kicker")}</span>
        </div>
        <h1 className="mt-5 text-[2.75rem] font-[380] leading-[1.02] tracking-[-0.025em] text-ink">
          {t("welcome.title")}
        </h1>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("welcome.searchDocs", { mod })}
          className="group mt-9 flex w-full items-center gap-3 border-b-2 border-ink/70 pb-3 text-left transition-colors duration-200 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
        >
          <SearchIcon size={19} className="shrink-0 text-muted transition-colors group-hover:text-accent-text" />
          <span className="min-w-0 flex-1 truncate text-[1.3rem] italic text-faint transition-colors group-hover:text-muted">
            {t("palette.input")}
          </span>
          <span className="flex shrink-0 gap-1">
            <kbd className="kbd">{mod}</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] text-muted">
            {tn(lang, docCount, "welcome.docCountOne", "welcome.docCountMany", { n: docCount })}
          </span>
          <button
            onClick={openCatalogTab}
            className="font-mono text-[11px] text-ink-2 underline decoration-rule decoration-1 underline-offset-[5px] transition-colors hover:text-accent-text hover:decoration-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
          >
            {t("welcome.searchCatalog")} →
          </button>
        </div>

        <section className="mt-14" aria-label={t("welcome.shortcuts")}>
          <p className="label border-b border-ink/80 pb-2">{t("welcome.shortcuts")}</p>
          <ul className="mt-1.5">
            {shortcuts.map((s) => (
              <Shortcut key={s.label} keys={s.keys} label={t(s.label)} />
            ))}
          </ul>
        </section>

        <div className="relative mt-10 border border-rule bg-paper-3 px-5 py-4">
          <span aria-hidden className="absolute -inset-y-px -left-px w-[3px] bg-accent" />
          <p className="label">{t("welcome.filterHead")}</p>
          <p className="mt-2 font-mono text-[15px] font-semibold text-ink">
            docset<span className="text-accent-text">:</span>query
          </p>
          <p className="mt-1.5 text-[14.5px] italic text-ink-2">
            {t("welcome.filterBy")}{" "}
            <code className="rounded-sm border border-rule px-1.5 py-0.5 font-mono text-[12px] not-italic text-ink">
              <span className="font-semibold text-accent-text">cpp:</span>vector
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
