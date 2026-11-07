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
  ExternalIcon,
  FolderIcon,
  InfoIcon,
  KeyboardIcon,
  MinusIcon,
  PaletteIcon,
  PlusIcon,
  RefreshIcon,
  SlidersIcon,
} from "./Icons";
import { useT } from "../hooks/useT";
import { LANGUAGE_NAMES, type I18nKey } from "../lib/i18n";
import { ACCENTS, ACCENT_HEX } from "../lib/accent";
import { getSettings, setRestoreTabs } from "../lib/commands";
import { PALETTE_LIMITS } from "../lib/prefs";
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

// ---------------------------------------------------------------------------
// Piezas visuales

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && (
        <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {title}
        </p>
      )}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200/80 bg-white shadow-soft dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.03]">
        {children}
      </div>
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
    <div className={`px-4 py-3.5 ${stacked ? "space-y-3" : "flex items-center justify-between gap-6"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{desc}</p>}
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
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 ease-smooth ${
        checked ? "bg-accent-solid" : "bg-gray-300 dark:bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-soft transition-transform duration-200 ease-smooth ${
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
    <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-white/5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-w-[3.5rem] rounded-md px-3 py-1 text-sm transition-all duration-150 ease-smooth ${
              on
                ? "bg-white font-medium text-gray-900 shadow-soft dark:bg-white/15 dark:text-white"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
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
          {i > 0 && <span className="mr-0.5 text-xs text-gray-400">{t("settings.sc.or")}</span>}
          {combo.map((k, j) => (
            <kbd
              key={j}
              className="min-w-[1.6rem] rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-center text-xs font-medium text-gray-600 shadow-[0_1px_0_rgb(0_0_0/0.06)] dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
            >
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

/** Miniatura de la interfaz para las tarjetas de tema. */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const pane = (dark: boolean) => (
    <div className={`flex h-full flex-1 ${dark ? "bg-gray-900" : "bg-white"}`}>
      <div className={`w-1/3 space-y-1 p-1.5 ${dark ? "bg-gray-950" : "bg-gray-100"}`}>
        <div className="h-1 w-3/4 rounded-full bg-accent/80" />
        <div className={`h-1 w-full rounded-full ${dark ? "bg-white/15" : "bg-gray-300"}`} />
        <div className={`h-1 w-2/3 rounded-full ${dark ? "bg-white/15" : "bg-gray-300"}`} />
      </div>
      <div className="flex-1 space-y-1 p-1.5">
        <div className={`h-1.5 w-1/2 rounded-full ${dark ? "bg-white/30" : "bg-gray-400"}`} />
        <div className={`h-1 w-full rounded-full ${dark ? "bg-white/10" : "bg-gray-200"}`} />
        <div className={`h-1 w-5/6 rounded-full ${dark ? "bg-white/10" : "bg-gray-200"}`} />
        <div className={`h-1 w-2/3 rounded-full ${dark ? "bg-white/10" : "bg-gray-200"}`} />
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
    </div>
  );
}

function AppearanceSection() {
  const { t } = useT();
  const mode = useTheme((s) => s.mode);
  const accent = useAccent((s) => s.accent);
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  const accentButtons = useRef(new Map<Accent, HTMLButtonElement>());

  return (
    <div className="space-y-6">
      <Group>
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
                    className={`h-20 overflow-hidden rounded-lg border transition-all duration-150 ease-smooth ${
                      on
                        ? "border-transparent ring-2 ring-accent-text ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
                        : "border-gray-200 group-hover:border-gray-300 dark:border-white/10 dark:group-hover:border-white/20"
                    }`}
                  >
                    <ThemePreview mode={value} />
                  </div>
                  <span className={`mt-2 flex items-center gap-1.5 text-sm ${on ? "font-medium text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
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
            className="flex flex-wrap gap-2"
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
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-all duration-150 ease-smooth ${
                    on
                      ? "border-accent-text/40 bg-accent/10 font-medium text-gray-900 dark:text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/20"
                  }`}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full shadow-soft"
                    style={{ backgroundColor: ACCENT_HEX[value].light.accent }}
                  >
                    {on && <CheckIcon size={13} strokeWidth={3} className="text-white" />}
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

function ReadingSection() {
  const { t } = useT();
  const smoothScroll = usePrefs((s) => s.smoothScroll);
  const linkPrefetch = usePrefs((s) => s.linkPrefetch);
  const zoom = useZoom((s) => s.level);
  const stepBtn =
    "flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white";

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
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-white/5">
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
              <span className="w-12 text-center font-mono text-xs tabular-nums text-gray-700 dark:text-gray-200">
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
              className={`break-all rounded-lg px-3 py-2 font-mono text-xs ${
                dirMissing
                  ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                  : "bg-gray-50 text-gray-600 dark:bg-white/5 dark:text-gray-300"
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
          <div
            key={s.label}
            className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-soft dark:border-white/10 dark:bg-white/[0.03]"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <Group title={t("settings.installed")}>
          <div className="grid grid-cols-2 gap-1 p-2">
            {sorted.map((d) => (
              <div key={d.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <DocsetIcon icon={d.icon} name={d.name} hint={d.id} />
                <span className="truncate">{d.name}</span>
                {d.version && <span className="ml-auto shrink-0 font-mono text-[11px] text-gray-400">{d.version}</span>}
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
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <DocsetIcon icon={p.icon} name={p.name} hint={p.id} />
                  <span className="truncate">{p.name}</span>
                </span>
                <button type="button" onClick={() => void extract(p.id)} disabled={busy} className="btn px-2.5 py-1 text-xs">
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
            <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="text-sm text-gray-700 dark:text-gray-200">{t(r.label)}</span>
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
    "flex items-center justify-between px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5";

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center rounded-xl border border-gray-200/80 bg-gradient-to-b from-accent/10 to-transparent px-6 py-8 text-center dark:border-white/10">
        <AppLogo size={64} />
        <h3 className="mt-4 text-xl font-semibold tracking-tight">OpenDoc</h3>
        <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
          {t("settings.version", { version })}
        </p>
        <p className="mt-3 max-w-sm text-sm text-gray-600 dark:text-gray-300">{t("settings.aboutTagline")}</p>
      </div>

      <Group>
        {[
          { label: t("settings.sourceCode"), href: REPO_URL },
          { label: "opendoc-core", href: CORE_URL },
          { label: "opendoc-cli", href: CLI_URL },
        ].map((l) => (
          <a key={l.href} href={l.href} className={`${link} first:rounded-t-xl last:rounded-b-xl`}>
            <span>{l.label}</span>
            <ExternalIcon size={14} className="text-gray-400" />
          </a>
        ))}
      </Group>

      <Group>
        <Row label={t("settings.resetPrefs")} desc={t("settings.resetPrefsDesc")}>
          <button
            type="button"
            onClick={reset}
            className={
              confirming
                ? "inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-soft transition-all hover:bg-red-500 active:scale-[0.98]"
                : "btn"
            }
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
  reading: "settings.nav.reading",
  docsets: "settings.nav.docsets",
  shortcuts: "settings.nav.shortcuts",
  about: "settings.nav.about",
};

const DESC_KEY: Record<SettingsSection, I18nKey> = {
  general: "settings.desc.general",
  appearance: "settings.desc.appearance",
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
        className="surface flex h-[min(640px,calc(100vh-2rem))] w-[min(900px,100%)] overflow-hidden"
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
          className="flex w-56 shrink-0 flex-col border-r border-gray-200/80 bg-gray-50/80 p-3 dark:border-white/5 dark:bg-black/20"
        >
          <div className="flex items-center gap-2.5 px-2 pb-5 pt-2">
            <AppLogo size={28} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight tracking-tight">{t("settings.title")}</p>
              <p className="text-xs leading-tight text-gray-500 dark:text-gray-400">{t("settings.subtitle")}</p>
            </div>
          </div>
          <ul className="space-y-0.5">
            {SECTIONS.map(({ id, icon: Icon }) => {
              const on = id === section;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => setSection(id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150 ease-smooth ${
                      on
                        ? "bg-white font-medium text-gray-900 shadow-soft dark:bg-white/10 dark:text-white"
                        : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
                    }`}
                  >
                    <Icon size={16} className={on ? "text-accent-text" : ""} />
                    {t(NAV_KEY[id])}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto px-2 font-mono text-[11px] text-gray-400 dark:text-gray-500">v{version}</p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 px-8 pb-5 pt-7">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t(NAV_KEY[section])}</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t(DESC_KEY[section])}</p>
            </div>
            <button aria-label={t("settings.close")} title={t("settings.close")} onClick={close} className="icon-btn -mr-2" autoFocus>
              <CloseIcon size={16} />
            </button>
          </header>
          <div key={section} className="min-h-0 flex-1 animate-rise-in overflow-y-auto px-8 pb-8">
            {section === "general" && <GeneralSection />}
            {section === "appearance" && <AppearanceSection />}
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
