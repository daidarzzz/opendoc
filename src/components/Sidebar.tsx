// Barra lateral: árbol de navegación, carpeta, catálogo, pendientes, estado, tema.
import { BrowseTree } from "./BrowseTree";
import { AppLogo } from "./AppLogo";
import { DocsetIcon } from "./DocsetIcon";

import { PanelToggleIcon } from "./PanelToggleIcon";
import { CloseIcon, FolderIcon, SettingsIcon } from "./Icons";
import { useT } from "../hooks/useT";
import { LANGUAGE_NAMES, type I18nKey } from "../lib/i18n";
import { ACCENTS, ACCENT_HEX } from "../lib/accent";
import type { Accent } from "../lib/types";
import { getSettings, setRestoreTabs } from "../lib/commands";
import { setSessionEnabled } from "../lib/sessionSync";
import { useAccent } from "../store/accent";
import { useDocsets } from "../store/docsets";
import { useLang } from "../store/lang";
import { version } from "../../package.json";
import { useTheme } from "../store/theme";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Language } from "../lib/types";

const THEME_VALUES = ["system", "light", "dark"] as const;
const LANG_VALUES: Language[] = ["en", "es"];
const ACCENT_KEY: Record<Accent, I18nKey> = {
  red: "settings.accentRed",
  blue: "settings.accentBlue",
  amber: "settings.accentAmber",
  catppuccin: "settings.accentCatppuccin",
};

export function Sidebar({
  style,
  collapsed,
  expandedWidth,
  onCollapse,
  animate,
}: {
  style: CSSProperties;
  /** Panel oculto: el aside anima su ancho a 0 y el contenido queda inerte. */
  collapsed: boolean;
  /** Ancho del contenido interno (fijo para que la animación recorte, no aplaste). */
  expandedWidth: number;
  /** Ocultar el panel (botón junto a Ajustes). */
  onCollapse: () => void;
  /** Transición de ancho activa (solo al plegar/desplegar, nunca al arrastrar). */
  animate: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoreTabs, setRestoreTabsState] = useState(true);
  const { t, lang } = useT();
  const setLang = useLang((s) => s.setLang);
  const {
    pending,
    extractingIds,
    savedDir,
    choose,
    extract,
  } = useDocsets();
  const mode = useTheme((s) => s.mode);
  const accent = useAccent((s) => s.accent);
  const accentButtons = useRef(new Map<Accent, HTMLButtonElement>());
  const themeLabel = (value: (typeof THEME_VALUES)[number]): string =>
    value === "light"
      ? t("settings.themeLight")
      : value === "dark"
        ? t("settings.themeDark")
        : t("settings.themeSystem");

  useEffect(() => {
    if (!settingsOpen) return;
    void (async () => {
      try {
        setRestoreTabsState((await getSettings()).restore_tabs ?? true);
      } catch {
        // Se conserva el valor local.
      }
    })();
  }, [settingsOpen]);

  const toggleRestoreTabs = (): void => {
    const next = !restoreTabs;
    setRestoreTabsState(next);
    void (async () => {
      try {
        await setRestoreTabs(next);
      } catch {
        // Se conserva local; el backend persiste cuando puede.
      }
      // En caliente no se restaura encima: solo se guarda el actual.
      setSessionEnabled(next);
    })();
  };

  const segBtn = (on: boolean): string =>
    `flex-1 rounded-md px-3 py-1.5 text-sm transition-all duration-150 ease-smooth ${
      on
        ? "bg-white font-medium text-gray-900 shadow-soft dark:bg-white/15 dark:text-white"
        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    }`;
  const segGroup = "flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-white/5";
  const sectionLabel =
    "mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500";

  return (
    <aside
      style={collapsed ? { width: 0, flexBasis: 0 } : style}
      inert={collapsed}
      className={`flex h-full shrink-0 overflow-hidden border-r ${animate ? "transition-[width,flex-basis] duration-300 ease-smooth" : ""} ${collapsed ? "border-transparent" : "border-gray-200/80 bg-gray-50/80 dark:border-white/5 dark:bg-gray-950"}`}
    >
      <div
        style={{ width: expandedWidth }}
        className={`flex h-full min-w-0 shrink-0 flex-col transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}
      >
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <AppLogo size={18} />
          OpenDoc
        </h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSettingsOpen(true)}
            title={t("settings.title")}
            aria-label={t("settings.title")}
            className="icon-btn"
          >
            <SettingsIcon size={18} />
          </button>
          <button
            onClick={onCollapse}
            title={t("settings.collapseSidebar")}
            aria-label={t("settings.collapseSidebar")}
            className="icon-btn"
          >
            <PanelToggleIcon direction="left" />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="backdrop z-40 pt-[16vh]" onClick={() => setSettingsOpen(false)} role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("settings.title")}
            className="surface w-full max-w-sm space-y-5 p-5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setSettingsOpen(false);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight">{t("settings.title")}</h2>
              <button aria-label={t("settings.close")} onClick={() => setSettingsOpen(false)} className="icon-btn -mr-1.5" autoFocus>
                <CloseIcon size={16} />
              </button>
            </div>
            <div><p className={sectionLabel}>{t("settings.theme")}</p><div className={segGroup}>{THEME_VALUES.map((value) => <button key={value} aria-pressed={mode === value} onClick={() => void useTheme.getState().setMode(value)} className={segBtn(mode === value)}>{themeLabel(value)}</button>)}</div></div>
            <div><p className={sectionLabel}>{t("settings.language")}</p><div className={segGroup}>{LANG_VALUES.map((value) => <button key={value} aria-pressed={lang === value} onClick={() => void setLang(value)} className={segBtn(lang === value)}>{LANGUAGE_NAMES[value]}</button>)}</div></div>
            <div>
              <p id="opendoc-accent-label" className={sectionLabel}>{t("settings.accent")}</p>
              <div role="radiogroup" aria-labelledby="opendoc-accent-label" className="flex items-center gap-3" onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                e.preventDefault();
                const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                const next = ACCENTS[(ACCENTS.indexOf(accent) + dir + ACCENTS.length) % ACCENTS.length] ?? "red";
                void useAccent.getState().setAccent(next);
                accentButtons.current.get(next)?.focus();
              }}>
                {ACCENTS.map((value) => (
                  <button
                    key={value}
                    ref={(el) => {
                      if (el) accentButtons.current.set(value, el);
                      else accentButtons.current.delete(value);
                    }}
                    role="radio"
                    aria-checked={accent === value}
                    aria-label={t(ACCENT_KEY[value])}
                    title={t(ACCENT_KEY[value])}
                    onClick={() => void useAccent.getState().setAccent(value)}
                    style={{ backgroundColor: ACCENT_HEX[value].light.accent }}
                    className={`h-7 w-7 rounded-full shadow-soft transition-all duration-200 ease-smooth hover:scale-110 ${accent === value ? "scale-110 ring-2 ring-accent-text ring-offset-2 ring-offset-white dark:ring-offset-gray-900" : "ring-1 ring-black/10 dark:ring-white/10"}`}
                  />
                ))}
                <AppLogo size={24} className="ml-auto" />
              </div>
            </div>
            <div><label className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" checked={restoreTabs} onChange={toggleRestoreTabs} className="h-4 w-4 accent-accent-solid" />{t("settings.restoreTabs")}</label></div>
            <div className="border-t border-gray-100 pt-4 dark:border-white/5">
              <p className={sectionLabel}>{t("settings.docsetsFolder")}</p>
              <p className="break-all rounded-md bg-gray-50 px-2.5 py-2 font-mono text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">{savedDir ?? t("settings.notConfigured")}</p>
              <button onClick={() => void choose()} className="btn mt-2.5"><FolderIcon size={15} />{t("settings.chooseFolder")}</button>
            </div>
          </section>
        </div>
      )}

      <nav aria-label={t("settings.docsetsNav")} className="flex min-h-0 flex-1 flex-col px-2">
        <BrowseTree />
        {pending.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {t("settings.pendingTarix")}
            </p>
            <ul className="space-y-0.5 pb-1">
              {pending.map((p) => {
                const busy = extractingIds.includes(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-gray-200/60 dark:hover:bg-white/5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DocsetIcon icon={p.icon} name={p.name} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <button
                      onClick={() => void extract(p.id)}
                      disabled={busy}
                      className="btn px-2 py-0.5 text-xs"
                    >
                      {busy ? t("settings.extracting") : t("common.install")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-gray-200/80 px-3 py-2.5 text-[11px] text-gray-400 dark:border-white/5 dark:text-gray-500">
        <p className="font-mono">v{version}</p>
      </div>
      </div>
    </aside>
  );
}
