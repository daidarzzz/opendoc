// Barra lateral: árbol de navegación, carpeta, catálogo, pendientes, estado, tema.
import { BrowseTree } from "./BrowseTree";
import { AppLogo } from "./AppLogo";
import { DocsetIcon } from "./DocsetIcon";
import { ErrorDetails } from "./ErrorDetails";
import { PanelToggleIcon } from "./PanelToggleIcon";
import { useT } from "../hooks/useT";
import { LANGUAGE_NAMES, formatCount, type I18nKey } from "../lib/i18n";
import { ACCENTS, ACCENT_HEX } from "../lib/accent";
import type { Accent } from "../lib/types";
import { getSettings, setRestoreTabs } from "../lib/commands";
import { setSessionEnabled } from "../lib/sessionSync";
import { useAccent } from "../store/accent";
import { useDocsets } from "../store/docsets";
import { useLang } from "../store/lang";
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
}: {
  style: CSSProperties;
  /** Panel oculto: el aside anima su ancho a 0 y el contenido queda inerte. */
  collapsed: boolean;
  /** Ancho del contenido interno (fijo para que la animación recorte, no aplaste). */
  expandedWidth: number;
  /** Ocultar el panel (botón junto a Ajustes). */
  onCollapse: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoreTabs, setRestoreTabsState] = useState(true);
  const { t, lang } = useT();
  const setLang = useLang((s) => s.setLang);
  const {
    pending,
    extractingIds,
    issues,
    status,
    error,
    dirMissing,
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

  return (
    <aside
      style={collapsed ? { width: 0, flexBasis: 0 } : style}
      inert={collapsed}
      className={`flex h-full shrink-0 overflow-hidden border-r transition-[width,flex-basis] duration-200 ease-in-out ${collapsed ? "border-transparent" : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950"}`}
    >
      <div
        style={{ width: expandedWidth }}
        className="flex h-full min-w-0 shrink-0 flex-col"
      >
      <div className="flex items-center justify-between p-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <AppLogo size={18} />
          OpenDoc
        </h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSettingsOpen(true)}
            title={t("settings.title")}
            aria-label={t("settings.title")}
            className="rounded-full p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.49.49 0 0 0 13.92 2h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.03-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z" />
            </svg>
          </button>
          <button
            onClick={onCollapse}
            title={t("settings.collapseSidebar")}
            aria-label={t("settings.collapseSidebar")}
            className="rounded-full p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <PanelToggleIcon direction="left" />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[18vh]" onClick={() => setSettingsOpen(false)} role="presentation">
          <section role="dialog" aria-modal="true" aria-label={t("settings.title")} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{t("settings.title")}</h2><button aria-label={t("settings.close")} onClick={() => setSettingsOpen(false)}>×</button></div>
            <div><p className="mb-2 text-xs text-gray-500">{t("settings.theme")}</p><div className="flex gap-2">{THEME_VALUES.map((value) => <button key={value} aria-pressed={mode === value} onClick={() => void useTheme.getState().setMode(value)} className={`rounded border px-3 py-1 text-sm ${mode === value ? "border-accent-text bg-accent/10" : "border-gray-300 dark:border-gray-700"}`}>{themeLabel(value)}</button>)}</div></div>
            <div><p className="mb-2 text-xs text-gray-500">{t("settings.language")}</p><div className="flex gap-2">{LANG_VALUES.map((value) => <button key={value} aria-pressed={lang === value} onClick={() => void setLang(value)} className={`rounded border px-3 py-1 text-sm ${lang === value ? "border-accent-text bg-accent/10" : "border-gray-300 dark:border-gray-700"}`}>{LANGUAGE_NAMES[value]}</button>)}</div></div>
            <div>
              <p id="opendoc-accent-label" className="mb-2 text-xs text-gray-500">{t("settings.accent")}</p>
              <div role="radiogroup" aria-labelledby="opendoc-accent-label" className="flex items-center gap-2.5" onKeyDown={(e) => {
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
                    className={`h-6 w-6 rounded-full ${accent === value ? "ring-2 ring-accent-text ring-offset-2 ring-offset-white dark:ring-offset-gray-900" : "ring-1 ring-gray-300 hover:ring-gray-400 dark:ring-gray-700"}`}
                  />
                ))}
                <AppLogo size={22} className="ml-1" />
              </div>
            </div>
            <div><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={restoreTabs} onChange={toggleRestoreTabs} className="accent-accent-solid" />{t("settings.restoreTabs")}</label></div>
            <div><p className="mb-1 text-xs text-gray-500">{t("settings.docsetsFolder")}</p><p className="break-all text-xs text-gray-600 dark:text-gray-300">{savedDir ?? t("settings.notConfigured")}</p><button onClick={() => void choose()} className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800">{t("settings.chooseFolder")}</button></div>
          </section>
        </div>
      )}

      <nav aria-label={t("settings.docsetsNav")} className="flex min-h-0 flex-1 flex-col px-2">
        <BrowseTree />
        {pending.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-[11px] uppercase text-gray-400">
              {t("settings.pendingTarix")}
            </p>
            <ul className="space-y-0.5">
              {pending.map((p) => {
                const busy = extractingIds.includes(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DocsetIcon icon={p.icon} name={p.name} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <button
                      onClick={() => void extract(p.id)}
                      disabled={busy}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
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

      <div className="border-t border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800">
        <p>{t(status.key, status.vars)}</p>
        {dirMissing && (
          <div className="mt-1 rounded bg-yellow-100 p-2 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
            <p>{t("settings.dirUnavailable")}{savedDir ? `: ${savedDir}` : ""} {t("settings.diskHint")}</p>
            <button
              onClick={() => void choose()}
              className="mt-1 underline"
            >
              {t("settings.chooseAnother")}
            </button>
          </div>
        )}
        {issues.length > 0 && <p>{formatCount(lang, issues.length)} {t("settings.issuesSuffix")}</p>}
        <ErrorDetails error={error} />
      </div>
      </div>
    </aside>
  );
}
