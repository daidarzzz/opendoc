// Panel de Ajustes: ventana amplia con navegación por secciones (General,
// Apariencia, Lectura, Docsets, Atajos, Acerca de). Se abre desde la barra
// lateral o con Ctrl/Cmd+, (ver `store/settingsUi`).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { AppLogo } from "./AppLogo";
import { DocsetIcon } from "./DocsetIcon";
import {
  BookIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  ExternalIcon,
  FolderIcon,
  HomeIcon,
  InfoIcon,
  KeyboardIcon,
  MinusIcon,
  PaletteIcon,
  PlusIcon,
  RefreshIcon,
  SlidersIcon,
  TrashIcon,
} from "./Icons";
import { useT } from "../hooks/useT";
import { LANGUAGE_NAMES, type I18nKey } from "../lib/i18n";
import { ACCENTS, ACCENT_HEX, CANVAS_HEX } from "../lib/accent";
import { checkForUpdate, getSettings, installUpdate, relaunchApp, setRestoreTabs } from "../lib/commands";
import { HOME_SECTIONS, PALETTE_LIMITS, type HomePrefs } from "../lib/prefs";
import { useRecent } from "../store/recent";
import { CARD_HEX, DESIGNS, canvasHex, type Design } from "../lib/design";
import { setSessionEnabled } from "../lib/sessionSync";
import { formatZoom, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from "../lib/zoom";
import type { Accent, Language, ThemeMode } from "../lib/types";
import { useAccent } from "../store/accent";
import { useDocsets } from "../store/docsets";
import { useLang } from "../store/lang";
import { usePrefs } from "../store/prefs";
import { useSettingsUi, type SettingsSection } from "../store/settingsUi";
import { useTabs } from "../store/tabs";
import { useTheme } from "../store/theme";
import { useZoom } from "../store/zoom";
import { version } from "../../package.json";

const REPO_URL = "https://github.com/daidarzzz/opendoc";
const CORE_URL = "https://github.com/daidarzzz/opendoc-core";
const CLI_URL = "https://github.com/daidarzzz/opendoc-cli";

/** Nombres de las teclas modificadoras según el sistema (como Welcome). */
function modifierKeys(): { MOD: string; ALT: string; SHIFT: string } {
  const mac = platform() === "macos";
  return mac ? { MOD: "⌘", ALT: "⌥", SHIFT: "⇧" } : { MOD: "Ctrl", ALT: "Alt", SHIFT: "Shift" };
}

const SECTIONS: { id: SettingsSection; icon: (p: { size?: number; className?: string }) => ReactNode }[] = [
  { id: "general", icon: SlidersIcon },
  { id: "appearance", icon: PaletteIcon },
  { id: "home", icon: HomeIcon },
  { id: "reading", icon: BookIcon },
  { id: "docsets", icon: FolderIcon },
  { id: "shortcuts", icon: KeyboardIcon },
  { id: "about", icon: InfoIcon },
];

const ACCENT_KEY: Record<Accent, I18nKey> = {
  red: "settings.accentRed",
  blue: "settings.accentBlue",
  amber: "settings.accentAmber",
  catppuccin: "settings.accentCatppuccin",
};

const THEMES: { value: ThemeMode; key: I18nKey }[] = [
  { value: "system", key: "settings.themeSystem" },
  { value: "light", key: "settings.themeLight" },
  { value: "dark", key: "settings.themeDark" },
];

const LANG_VALUES: Language[] = ["en", "es"];

const DESIGN_KEY: Record<Design, I18nKey> = {
  color: "settings.designColor",
  paper: "settings.designPaper",
  classic: "settings.designClassic",
};

/** Voz de cada estilo para su miniatura (independiente del estilo activo). */
const DESIGN_LOOK: Record<Design, { font: string; radius: number; weight: number }> = {
  color: { font: "'Bricolage Grotesque Variable', sans-serif", radius: 10, weight: 700 },
  paper: { font: "'Newsreader Variable', serif", radius: 3, weight: 420 },
  classic: { font: "'Inter Variable', sans-serif", radius: 8, weight: 650 },
};

/** Miniatura de un estilo: lienzo + tarjeta con un «Aa» en su tipografía. */
function DesignPreview({ design, accent, dark }: { design: Design; accent: Accent; dark: boolean }) {
  const look = DESIGN_LOOK[design];
  const mode = dark ? "dark" : "light";
  return (
    <div className="flex h-full w-full gap-1.5 p-1.5" style={{ backgroundColor: canvasHex(design, accent, mode) }}>
      <div className="w-1/4 space-y-1.5 pt-1">
        <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: ACCENT_HEX[accent][mode].accent }} />
        <div className={`h-1 w-full rounded-full ${dark ? "bg-white/20" : "bg-black/15"}`} />
        <div className={`h-1 w-2/3 rounded-full ${dark ? "bg-white/20" : "bg-black/15"}`} />
      </div>
      <div
        className="flex flex-1 flex-col justify-between p-2 shadow-sm"
        style={{ backgroundColor: CARD_HEX[design][mode], borderRadius: look.radius * 0.6 }}
      >
        <span
          className={`text-[22px] leading-none ${dark ? "text-white" : "text-black"}`}
          style={{ fontFamily: look.font, fontWeight: look.weight }}
        >
          Aa<span style={{ color: ACCENT_HEX[accent][mode].accent }}>_</span>
        </span>
        <div className="space-y-1">
          <div className={`h-1 w-full rounded-full ${dark ? "bg-white/15" : "bg-black/10"}`} />
          <div className={`h-1 w-2/3 rounded-full ${dark ? "bg-white/15" : "bg-black/10"}`} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas visuales

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <p className="label mb-2 px-1">{title}</p>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">{children}</div>
    </div>
  );
}

function Row({
  label,
  desc,
  children,
  stacked = false,
}: {
  label: string;
  desc?: string;
  children?: ReactNode;
  /** Control debajo del texto (para controles anchos). */
  stacked?: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${stacked ? "space-y-3.5" : "flex items-center justify-between gap-8"}`}>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{desc}</p>}
      </div>
      {children !== undefined && <div className={stacked ? "" : "shrink-0"}>{children}</div>}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-smooth ${
        checked ? "bg-accent-solid" : "bg-ink/15"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-200 ease-smooth ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-xl bg-card-2 p-1 ring-1 ring-line">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-w-[3.25rem] rounded-lg px-3 py-1 text-[12.5px] transition-all duration-150 ease-smooth ${
              on
                ? "bg-card font-semibold text-ink shadow-soft ring-1 ring-line"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Keys({ combos }: { combos: string[][] }) {
  const { t } = useT();
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {combos.map((combo, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="mr-0.5 text-[12px] text-faint">{t("settings.sc.or")}</span>}
          {combo.map((k, j) => (
            <kbd key={j} className="kbd">
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

/** Miniatura de la interfaz para las tarjetas de tema. */
function ThemePreview({ mode, accent, design }: { mode: ThemeMode; accent: Accent; design: Design }) {
  // Miniatura del lienzo teñido + tarjeta, con los tonos fijos de cada modo.
  const pane = (dark: boolean) => (
    <div className="flex h-full flex-1 gap-1.5 p-1.5" style={{ backgroundColor: canvasHex(design, accent, dark ? "dark" : "light") }}>
      <div className="w-1/4 space-y-1.5 pt-1">
        <div className="h-1.5 w-3/4 rounded-full bg-accent" />
        <div className={`h-1 w-full rounded-full ${dark ? "bg-white/20" : "bg-black/15"}`} />
        <div className={`h-1 w-2/3 rounded-full ${dark ? "bg-white/20" : "bg-black/15"}`} />
      </div>
      <div className="flex-1 space-y-1.5 rounded-md p-2 shadow-sm" style={{ backgroundColor: CARD_HEX[design][dark ? "dark" : "light"] }}>
        <div className={`h-2 w-1/2 rounded-full ${dark ? "bg-white/70" : "bg-black/70"}`} />
        <div className={`h-1 w-full rounded-full ${dark ? "bg-white/15" : "bg-black/10"}`} />
        <div className={`h-1 w-5/6 rounded-full ${dark ? "bg-white/15" : "bg-black/10"}`} />
        <div className={`h-1 w-2/3 rounded-full ${dark ? "bg-white/15" : "bg-black/10"}`} />
      </div>
    </div>
  );
  if (mode === "system") {
    return (
      <div className="relative h-full w-full">
        <div className="absolute inset-0 flex">{pane(false)}</div>
        <div className="absolute inset-0 flex [clip-path:polygon(100%_0,100%_100%,0_100%)]">{pane(true)}</div>
      </div>
    );
  }
  return <div className="flex h-full w-full">{pane(mode === "dark")}</div>;
}

// ---------------------------------------------------------------------------
// Secciones

const RELEASES_URL = "https://github.com/daidarzzz/opendoc/releases/latest";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; pct: number | null }
  | { kind: "restarting" }
  | { kind: "check-failed" }
  | { kind: "failed"; version: string };

/** Último resultado (vive mientras la app está abierta: no se repite al reabrir Ajustes). */
let lastUpdateState: UpdateState = { kind: "idle" };

/** Fila discreta de actualizaciones: comprueba sola al abrir y actualiza con un clic. */
function UpdateRow() {
  const { t } = useT();
  const [state, setStateRaw] = useState<UpdateState>(lastUpdateState);
  const setState = (next: UpdateState): void => {
    lastUpdateState = next;
    setStateRaw(next);
  };

  const runCheck = (): void => {
    setState({ kind: "checking" });
    void (async () => {
      try {
        const info = await checkForUpdate();
        setState(info ? { kind: "available", version: info.version } : { kind: "none" });
      } catch {
        setState({ kind: "check-failed" });
      }
    })();
  };

  useEffect(() => {
    if (lastUpdateState.kind === "idle") runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = (version: string): void => {
    setState({ kind: "downloading", version, pct: null });
    void (async () => {
      try {
        await installUpdate((received, total) => {
          setState({ kind: "downloading", version, pct: total ? Math.min(100, Math.round((received / total) * 100)) : null });
        });
        setState({ kind: "restarting" });
        await relaunchApp();
      } catch {
        setState({ kind: "failed", version });
      }
    })();
  };

  const desc =
    state.kind === "available" || state.kind === "downloading"
      ? t("update.available", { version: state.version })
      : state.kind === "none"
        ? t("update.upToDate")
        : state.kind === "check-failed"
          ? t("update.checkFailed")
          : state.kind === "failed"
            ? t("update.failed")
            : t("update.current", { version });

  return (
    <Row label={t("update.title")} desc={desc}>
      <div className="flex items-center gap-2">
        {state.kind === "available" && (
          <button type="button" onClick={() => install(state.version)} className="btn-primary">
            <DownloadIcon size={14} />
            {t("update.install")}
          </button>
        )}
        {state.kind === "downloading" && (
          <div className="flex w-44 flex-col gap-1.5">
            <span className="text-right text-[11.5px] font-medium tabular-nums text-muted">
              {t("update.downloading", { pct: state.pct === null ? "" : `${state.pct} %` })}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
              <div
                className={`h-full rounded-full bg-accent transition-[width] duration-300 ${state.pct === null ? "w-1/3 animate-pulse" : ""}`}
                style={state.pct === null ? undefined : { width: `${state.pct}%` }}
              />
            </div>
          </div>
        )}
        {state.kind === "restarting" && <span className="text-[12.5px] text-muted">{t("update.restarting")}</span>}
        {state.kind === "failed" && (
          <a href={RELEASES_URL} className="btn">
            <ExternalIcon size={13} />
            {t("update.manual")}
          </a>
        )}
        {state.kind === "none" && (
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckIcon size={14} />
          </span>
        )}
        {(state.kind === "idle" || state.kind === "checking" || state.kind === "none" || state.kind === "check-failed") && (
          <button type="button" onClick={runCheck} disabled={state.kind === "checking"} className="btn">
            <RefreshIcon size={13} className={state.kind === "checking" ? "animate-spin" : ""} />
            {state.kind === "checking" ? t("update.checking") : t("update.check")}
          </button>
        )}
      </div>
    </Row>
  );
}

function GeneralSection() {
  const { t, lang } = useT();
  const setLang = useLang((s) => s.setLang);
  const paletteLimit = usePrefs((s) => s.paletteLimit);
  const [restoreTabs, setRestoreTabsState] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setRestoreTabsState((await getSettings()).restore_tabs ?? true);
      } catch {
        // Se conserva el valor local.
      }
    })();
  }, []);

  const toggleRestoreTabs = (next: boolean): void => {
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
    <div className="space-y-6">
      <Group>
        <Row label={t("settings.language")} desc={t("settings.languageDesc")}>
          <Segmented
            value={lang}
            options={LANG_VALUES.map((v) => ({ value: v, label: LANGUAGE_NAMES[v] }))}
            onChange={(v) => void setLang(v)}
          />
        </Row>
        <Row label={t("settings.restoreTabs")} desc={t("settings.restoreTabsDesc")}>
          <Switch checked={restoreTabs} onChange={toggleRestoreTabs} label={t("settings.restoreTabs")} />
        </Row>
        <Row label={t("settings.paletteLimit")} desc={t("settings.paletteLimitDesc")}>
          <Segmented
            value={paletteLimit}
            options={PALETTE_LIMITS.map((v) => ({ value: v, label: String(v) }))}
            onChange={(v) => usePrefs.getState().set("paletteLimit", v)}
          />
        </Row>
      </Group>
      <Group>
        <UpdateRow />
      </Group>
    </div>
  );
}

function AppearanceSection() {
  const { t } = useT();
  const mode = useTheme((s) => s.mode);
  const accent = useAccent((s) => s.accent);
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  const design = usePrefs((s) => s.design);
  const accentButtons = useRef(new Map<Accent, HTMLButtonElement>());
  // Se recalcula al cambiar `mode` (suscrito arriba), también con Sistema.
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="space-y-6">
      <Group>
        <Row label={t("settings.design")} desc={t("settings.designDesc")} stacked>
          <div role="radiogroup" aria-label={t("settings.design")} className="grid grid-cols-3 gap-3">
            {DESIGNS.map((value) => {
              const on = design === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => usePrefs.getState().set("design", value)}
                  className="group text-left"
                >
                  <div
                    className={`h-24 overflow-hidden rounded-xl border transition-all duration-150 ease-smooth ${
                      on
                        ? "border-transparent ring-2 ring-accent ring-offset-2 ring-offset-card"
                        : "border-line group-hover:border-ink/25"
                    }`}
                  >
                    <DesignPreview design={value} accent={accent} dark={dark} />
                  </div>
                  <span className={`mt-2 flex items-center gap-1.5 text-[13px] ${on ? "font-semibold text-ink" : "font-medium text-muted"}`}>
                    {on && <CheckIcon size={14} className="text-accent-text" />}
                    {t(DESIGN_KEY[value])}
                  </span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t("settings.theme")} desc={t("settings.themeDesc")} stacked>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map(({ value, key }) => {
              const on = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void useTheme.getState().setMode(value)}
                  className="group text-left"
                >
                  <div
                    className={`h-20 overflow-hidden rounded-xl border transition-all duration-150 ease-smooth ${
                      on
                        ? "border-transparent ring-2 ring-accent ring-offset-2 ring-offset-card"
                        : "border-line group-hover:border-ink/25"
                    }`}
                  >
                    <ThemePreview mode={value} accent={accent} design={design} />
                  </div>
                  <span className={`mt-2 flex items-center gap-1.5 text-[13px] ${on ? "font-semibold text-ink" : "font-medium text-muted"}`}>
                    {on && <CheckIcon size={14} className="text-accent-text" />}
                    {t(key)}
                  </span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t("settings.accent")} desc={t("settings.accentDesc")} stacked>
          <div
            role="radiogroup"
            aria-label={t("settings.accent")}
            className="flex flex-wrap gap-5"
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
              e.preventDefault();
              const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
              const next = ACCENTS[(ACCENTS.indexOf(accent) + dir + ACCENTS.length) % ACCENTS.length] ?? "red";
              void useAccent.getState().setAccent(next);
              accentButtons.current.get(next)?.focus();
            }}
          >
            {ACCENTS.map((value) => {
              const on = accent === value;
              return (
                <button
                  key={value}
                  ref={(el) => {
                    if (el) accentButtons.current.set(value, el);
                    else accentButtons.current.delete(value);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => void useAccent.getState().setAccent(value)}
                  className={`group flex flex-col items-center gap-2 text-[12.5px] transition-colors duration-150 ${
                    on ? "font-semibold text-ink" : "font-medium text-muted hover:text-ink"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 ease-smooth ${
                      on ? "ring-2 ring-offset-2 ring-offset-card" : "group-hover:scale-105"
                    }`}
                    style={{
                      backgroundColor: CANVAS_HEX[value].light,
                      ["--tw-ring-color" as string]: ACCENT_HEX[value].light.accent,
                    }}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_2px_6px_-2px_rgb(0_0_0/0.4)]"
                      style={{ backgroundColor: ACCENT_HEX[value].light.accent }}
                    >
                      {on && <CheckIcon size={14} strokeWidth={3} className={value === "amber" ? "text-gray-900" : "text-white"} />}
                    </span>
                  </span>
                  {t(ACCENT_KEY[value])}
                </button>
              );
            })}
          </div>
        </Row>
        <Row label={t("settings.reduceMotion")} desc={t("settings.reduceMotionDesc")}>
          <Switch
            checked={reduceMotion}
            onChange={(v) => usePrefs.getState().set("reduceMotion", v)}
            label={t("settings.reduceMotion")}
          />
        </Row>
      </Group>
    </div>
  );
}

const HOME_KEYS: Record<keyof HomePrefs, { label: I18nKey; desc: I18nKey }> = {
  greeting: { label: "settings.home.greeting", desc: "settings.home.greetingDesc" },
  search: { label: "settings.home.search", desc: "settings.home.searchDesc" },
  filters: { label: "settings.home.filters", desc: "settings.home.filtersDesc" },
  recent: { label: "settings.home.recent", desc: "settings.home.recentDesc" },
  library: { label: "settings.home.library", desc: "settings.home.libraryDesc" },
  shortcuts: { label: "settings.home.shortcuts", desc: "settings.home.shortcutsDesc" },
};

function HomeSection() {
  const { t } = useT();
  const home = usePrefs((s) => s.home);
  const recentCount = useRecent((s) => s.pages.length);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!cleared) return;
    const id = window.setTimeout(() => setCleared(false), 2000);
    return () => window.clearTimeout(id);
  }, [cleared]);

  return (
    <div className="space-y-6">
      <Group title={t("settings.home.sections")}>
        {HOME_SECTIONS.map((key) => (
          <Row key={key} label={t(HOME_KEYS[key].label)} desc={t(HOME_KEYS[key].desc)}>
            <Switch
              checked={home[key]}
              onChange={(v) => usePrefs.getState().set("home", { ...usePrefs.getState().home, [key]: v })}
              label={t(HOME_KEYS[key].label)}
            />
          </Row>
        ))}
      </Group>
      <Group title={t("settings.home.history")}>
        <Row label={t("settings.home.clear")} desc={t("settings.home.clearDesc")}>
          <button
            type="button"
            disabled={recentCount === 0 && !cleared}
            onClick={() => {
              useRecent.getState().clear();
              setCleared(true);
            }}
            className="btn"
          >
            {cleared ? (
              <>
                <CheckIcon size={14} className="text-accent-text" />
                {t("settings.home.cleared")}
              </>
            ) : (
              <>
                <TrashIcon size={14} />
                {t("settings.home.clearAction")}
              </>
            )}
          </button>
        </Row>
      </Group>
    </div>
  );
}

function ReadingSection() {
  const { t } = useT();
  const smoothScroll = usePrefs((s) => s.smoothScroll);
  const linkPrefetch = usePrefs((s) => s.linkPrefetch);
  const toc = usePrefs((s) => s.toc);
  const zoom = useZoom((s) => s.level);
  const stepBtn =
    "flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="space-y-6">
      <Group>
        <Row label={t("settings.smoothScroll")} desc={t("settings.smoothScrollDesc")}>
          <Switch
            checked={smoothScroll}
            onChange={(v) => usePrefs.getState().set("smoothScroll", v)}
            label={t("settings.smoothScroll")}
          />
        </Row>
        <Row label={t("settings.zoom")} desc={t("settings.zoomDesc")}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-card-2 p-1 ring-1 ring-line">
              <button
                type="button"
                aria-label={t("settings.sc.zoomOut")}
                title={t("settings.sc.zoomOut")}
                disabled={zoom <= ZOOM_MIN}
                onClick={() => useZoom.getState().zoomOut()}
                className={stepBtn}
              >
                <MinusIcon size={14} />
              </button>
              <span className="w-12 text-center text-[12.5px] font-semibold tabular-nums text-ink">
                {formatZoom(zoom)}
              </span>
              <button
                type="button"
                aria-label={t("settings.sc.zoomIn")}
                title={t("settings.sc.zoomIn")}
                disabled={zoom >= ZOOM_MAX}
                onClick={() => useZoom.getState().zoomIn()}
                className={stepBtn}
              >
                <PlusIcon size={14} />
              </button>
            </div>
            <button
              type="button"
              aria-label={t("settings.sc.zoomReset")}
              title={t("settings.sc.zoomReset")}
              disabled={zoom === ZOOM_DEFAULT}
              onClick={() => useZoom.getState().reset()}
              className="icon-btn"
            >
              <RefreshIcon size={15} />
            </button>
          </div>
        </Row>
        <Row label={t("settings.toc")} desc={t("settings.tocDesc")}>
          <Switch checked={toc} onChange={(v) => usePrefs.getState().set("toc", v)} label={t("settings.toc")} />
        </Row>
        <Row label={t("settings.linkPrefetch")} desc={t("settings.linkPrefetchDesc")}>
          <Switch
            checked={linkPrefetch}
            onChange={(v) => usePrefs.getState().set("linkPrefetch", v)}
            label={t("settings.linkPrefetch")}
          />
        </Row>
      </Group>
    </div>
  );
}

function DocsetsSection() {
  const { t } = useT();
  const { docsets, pending, extractingIds, issues, savedDir, dirMissing, loading, choose, extract, refresh } =
    useDocsets();
  const sorted = [...docsets].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <Group>
        <Row label={t("settings.docsetsFolder")} desc={t("settings.docsetsFolderDesc")} stacked>
          <div className="space-y-2.5">
            <p
              className={`break-all rounded-xl px-3 py-2 font-mono text-[11.5px] ${
                dirMissing
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : "bg-card-2 text-ink-2 ring-1 ring-line"
              }`}
            >
              {savedDir ?? t("settings.notConfigured")}
              {dirMissing && <span className="mt-1 block font-sans">{t("settings.dirUnavailable")}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void choose()} className="btn">
                <FolderIcon size={15} />
                {t("settings.chooseFolder")}
              </button>
              <button type="button" onClick={() => void refresh()} disabled={!savedDir || loading} className="btn">
                <RefreshIcon size={15} className={loading ? "animate-spin" : ""} />
                {t("settings.rescan")}
              </button>
            </div>
          </div>
        </Row>
      </Group>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t("settings.installed"), value: docsets.length },
          { label: t("settings.issues"), value: issues.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card px-5 py-4">
            <p className="label">{s.label}</p>
            <p className="mt-1 heading text-[34px] leading-none tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <Group title={t("settings.installed")}>
          <div className="grid grid-cols-2 gap-x-6 px-5 py-2">
            {sorted.map((d) => (
              <div key={d.id} className="flex min-w-0 items-center gap-2.5 py-1.5 text-[13px] font-medium">
                <DocsetIcon icon={d.icon} name={d.name} hint={d.id} />
                <span className="truncate">{d.name}</span>
                {d.version && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">{d.version}</span>}
              </div>
            ))}
          </div>
        </Group>
      )}

      {pending.length > 0 && (
        <Group title={t("settings.pendingTarix")}>
          {pending.map((p) => {
            const busy = extractingIds.includes(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
                  <DocsetIcon icon={p.icon} name={p.name} hint={p.id} />
                  <span className="truncate">{p.name}</span>
                </span>
                <button type="button" onClick={() => void extract(p.id)} disabled={busy} className="btn px-2.5 py-1">
                  {busy ? t("settings.extracting") : t("common.install")}
                </button>
              </div>
            );
          })}
        </Group>
      )}

      <Group>
        <Row label={t("settings.catalog")} desc={t("settings.catalogDesc")}>
          <button
            type="button"
            onClick={() => {
              useSettingsUi.getState().close();
              useTabs.getState().openCatalogTab();
            }}
            className="btn-primary"
          >
            {t("settings.openCatalog")}
          </button>
        </Row>
      </Group>
    </div>
  );
}

function ShortcutsSection() {
  const { t } = useT();
  const click = t("settings.sc.click");
  const { MOD, ALT, SHIFT } = modifierKeys();
  const groups: { title: I18nKey; rows: { label: I18nKey; combos: string[][] }[] }[] = [
    {
      title: "settings.sc.groupGeneral",
      rows: [
        { label: "settings.sc.palette", combos: [[MOD, "K"]] },
        { label: "settings.sc.settings", combos: [[MOD, ","]] },
        { label: "settings.sc.catalog", combos: [["F3"]] },
      ],
    },
    {
      title: "settings.sc.groupTabs",
      rows: [
        { label: "settings.sc.newTab", combos: [[MOD, "T"]] },
        { label: "settings.sc.closeTab", combos: [[MOD, "W"]] },
        { label: "settings.sc.reopenTab", combos: [[MOD, SHIFT, "T"]] },
        { label: "settings.sc.nextTab", combos: [["Ctrl", "Tab"]] },
        { label: "settings.sc.prevTab", combos: [["Ctrl", SHIFT, "Tab"]] },
        { label: "settings.sc.tabN", combos: [[MOD, "1–9"]] },
      ],
    },
    {
      title: "settings.sc.groupViewer",
      rows: [
        { label: "settings.sc.back", combos: [[ALT, "←"]] },
        { label: "settings.sc.forward", combos: [[ALT, "→"]] },
        { label: "settings.sc.find", combos: [[MOD, "F"]] },
        { label: "settings.sc.zoomIn", combos: [[MOD, "+"]] },
        { label: "settings.sc.zoomOut", combos: [[MOD, "−"]] },
        { label: "settings.sc.zoomReset", combos: [[MOD, "0"]] },
        { label: "settings.sc.newTabLink", combos: [[t("settings.sc.middleClick")], [MOD, click]] },
      ],
    },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Group key={g.title} title={t(g.title)}>
          {g.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <span className="text-[13px] text-ink-2">{t(r.label)}</span>
              <Keys combos={r.combos} />
            </div>
          ))}
        </Group>
      ))}
    </div>
  );
}

function AboutSection() {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 2000);
    return () => window.clearTimeout(id);
  }, [done]);

  const reset = (): void => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    usePrefs.getState().reset();
    useZoom.getState().reset();
    void useTheme.getState().setMode("system");
    void useAccent.getState().setAccent("red");
    void (async () => {
      try {
        await setRestoreTabs(true);
      } catch {
        // Se conserva local; el backend persiste cuando puede.
      }
      setSessionEnabled(true);
    })();
    setDone(true);
  };

  const link =
    "group flex items-center justify-between px-5 py-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-card-2 hover:text-accent-text";

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center rounded-2xl bg-canvas px-6 py-9 text-center">
        <AppLogo size={68} className="drop-shadow-[0_10px_18px_rgb(var(--accent-ch)/0.45)]" />
        <h3 className="mt-5 heading text-[32px] leading-none">
          OpenDoc<span className="caret-blink text-accent">_</span>
        </h3>
        <p className="mt-3 rounded-full bg-card px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted shadow-soft">{t("settings.version", { version })}</p>
        <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-ink-2">{t("settings.aboutTagline")}</p>
      </div>

      <Group>
        {[
          { label: t("settings.sourceCode"), href: REPO_URL },
          { label: "opendoc-core", href: CORE_URL },
          { label: "opendoc-cli", href: CLI_URL },
        ].map((l) => (
          <a key={l.href} href={l.href} className={link}>
            <span>{l.label}</span>
            <ExternalIcon size={14} className="text-faint transition-colors group-hover:text-accent-text" />
          </a>
        ))}
      </Group>

      <Group>
        <Row label={t("settings.resetPrefs")} desc={t("settings.resetPrefsDesc")}>
          <button
            type="button"
            onClick={reset}
            className={confirming ? "btn-danger" : "btn"}
          >
            {done ? (
              <>
                <CheckIcon size={14} className="text-accent-text" />
                {t("settings.resetDone")}
              </>
            ) : confirming ? (
              t("settings.resetConfirm")
            ) : (
              t("settings.resetPrefs")
            )}
          </button>
        </Row>
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------------------

const NAV_KEY: Record<SettingsSection, I18nKey> = {
  general: "settings.nav.general",
  appearance: "settings.nav.appearance",
  home: "settings.nav.home",
  reading: "settings.nav.reading",
  docsets: "settings.nav.docsets",
  shortcuts: "settings.nav.shortcuts",
  about: "settings.nav.about",
};

const DESC_KEY: Record<SettingsSection, I18nKey> = {
  general: "settings.desc.general",
  appearance: "settings.desc.appearance",
  home: "settings.desc.home",
  reading: "settings.desc.reading",
  docsets: "settings.desc.docsets",
  shortcuts: "settings.desc.shortcuts",
  about: "settings.desc.about",
};

export function SettingsDialog() {
  const { t } = useT();
  const open = useSettingsUi((s) => s.open);
  const section = useSettingsUi((s) => s.section);
  const { close, setSection } = useSettingsUi.getState();

  if (!open) return null;

  return (
    <div className="backdrop z-40 items-center" onClick={close} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        className="surface flex h-[min(660px,calc(100vh-2rem))] w-[min(920px,100%)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <nav
          aria-label={t("settings.title")}
          className="flex w-56 shrink-0 flex-col bg-canvas px-3 pb-4 pt-5"
        >
          <div className="flex items-center gap-2.5 px-2 pb-5">
            <AppLogo size={28} />
            <div className="min-w-0">
              <p className="heading text-[16px] leading-tight">{t("settings.title")}</p>
              <p className="text-[12px] leading-tight text-muted">{t("settings.subtitle")}</p>
            </div>
          </div>
          <ul className="space-y-px">
            {SECTIONS.map(({ id, icon: Icon }) => {
              const on = id === section;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => setSection(id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all duration-150 ease-smooth ${
                      on ? "bg-card font-semibold text-ink shadow-soft" : "font-medium text-ink-2 hover:bg-canvas-2 hover:text-ink"
                    }`}
                  >
                    <Icon size={16} className={on ? "text-accent-text" : "text-muted"} />
                    {t(NAV_KEY[id])}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto px-2.5 font-mono text-[10.5px] text-faint">v{version}</p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 px-8 pb-5 pt-7">
            <div>
              <h2 className="heading text-[26px] leading-tight">{t(NAV_KEY[section])}</h2>
              <p className="mt-0.5 text-[13.5px] text-muted">{t(DESC_KEY[section])}</p>
            </div>
            <button aria-label={t("settings.close")} title={t("settings.close")} onClick={close} className="icon-btn -mr-2" autoFocus>
              <CloseIcon size={16} />
            </button>
          </header>
          <div key={section} className="min-h-0 flex-1 animate-rise-in overflow-y-auto px-8 pb-8">
            {section === "general" && <GeneralSection />}
            {section === "appearance" && <AppearanceSection />}
            {section === "home" && <HomeSection />}
            {section === "reading" && <ReadingSection />}
            {section === "docsets" && <DocsetsSection />}
            {section === "shortcuts" && <ShortcutsSection />}
            {section === "about" && <AboutSection />}
          </div>
        </div>
      </section>
    </div>
  );
}
