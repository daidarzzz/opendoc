// Barra lateral sobre el lienzo teñido: marca, búsqueda (abre la paleta),
// biblioteca (árbol de navegación), tarix pendientes y pie con catálogo y
// ajustes. Los ajustes viven en su propio panel (SettingsDialog).
import { platform } from "@tauri-apps/plugin-os";
import { BrowseTree } from "./BrowseTree";
import { AppLogo } from "./AppLogo";
import { CatalogIcon } from "./CatalogIcon";
import { DocsetIcon } from "./DocsetIcon";
import { PanelToggleIcon } from "./PanelToggleIcon";
import { SearchIcon, SettingsIcon } from "./Icons";
import { useT } from "../hooks/useT";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useSettingsUi } from "../store/settingsUi";
import { useTabs } from "../store/tabs";
import { version } from "../../package.json";
import type { CSSProperties } from "react";

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
  /** Ocultar el panel (botón junto a la marca). */
  onCollapse: () => void;
  /** Transición de ancho activa (solo al plegar/desplegar, nunca al arrastrar). */
  animate: boolean;
}) {
  const { t } = useT();
  const { docsets, pending, extractingIds, extract } = useDocsets();
  const catalogOpen = useTabs((s) => s.tabs.find((tab) => tab.id === s.activeId)?.type === "catalog");
  const mod = platform() === "macos" ? "⌘" : "Ctrl";

  return (
    <aside
      style={collapsed ? { width: 0, flexBasis: 0 } : style}
      inert={collapsed}
      className={`flex h-full shrink-0 overflow-hidden ${animate ? "transition-[width,flex-basis] duration-300 ease-smooth" : ""}`}
    >
      <div
        style={{ width: expandedWidth }}
        className={`flex h-full min-w-0 shrink-0 flex-col transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}
      >
        <div className="flex items-center justify-between pb-3 pl-4 pr-2 pt-3">
          <h1 className="flex items-center gap-2 heading text-[17px]">
            <AppLogo size={22} />
            OpenDoc
          </h1>
          <button
            onClick={onCollapse}
            title={t("settings.collapseSidebar")}
            aria-label={t("settings.collapseSidebar")}
            className="icon-btn"
          >
            <PanelToggleIcon direction="left" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => usePalette.getState().setOpen(true)}
          aria-label={t("welcome.searchDocs", { mod })}
          className="group mx-3 flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2 text-left shadow-soft ring-1 ring-canvas-line transition-all duration-150 hover:bg-card hover:shadow-float"
        >
          <SearchIcon size={15} className="shrink-0 text-muted transition-colors group-hover:text-accent-text" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{t("welcome.search")}</span>
          <kbd className="kbd h-[18px] shrink-0 px-1 text-[10px]">{mod} K</kbd>
        </button>

        <div className="flex items-center justify-between px-4 pb-1 pt-5">
          <span className="label">{t("sidebar.library")}</span>
          {docsets.length > 0 && (
            <span className="rounded-full bg-canvas-2 px-1.5 text-[10.5px] font-semibold tabular-nums leading-[18px] text-muted">
              {docsets.length}
            </span>
          )}
        </div>

        <nav aria-label={t("settings.docsetsNav")} className="flex min-h-0 flex-1 flex-col px-2">
          <BrowseTree />
          {pending.length > 0 && (
            <>
              <p className="label px-2 pb-1 pt-4">{t("settings.pendingTarix")}</p>
              <ul className="space-y-0.5 pb-2">
                {pending.map((p) => {
                  const busy = extractingIds.includes(p.id);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-canvas-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <DocsetIcon icon={p.icon} name={p.name} hint={p.id} />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <button
                        onClick={() => void extract(p.id)}
                        disabled={busy}
                        className="btn shrink-0 px-2 py-0.5 text-[11px]"
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

        <div className="flex items-center gap-1 px-2 pb-2.5 pt-2">
          <button
            type="button"
            onClick={() => useTabs.getState().openCatalogTab()}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              catalogOpen ? "bg-card text-ink shadow-soft" : "text-ink-2 hover:bg-canvas-2 hover:text-ink"
            }`}
          >
            <CatalogIcon size={15} className="text-accent-text" />
            <span className="truncate">{t("catalog.title")}</span>
          </button>
          <span className="px-1 font-mono text-[10px] text-faint">v{version}</span>
          <button
            onClick={() => useSettingsUi.getState().show()}
            title={t("settings.title")}
            aria-label={t("settings.title")}
            className="icon-btn"
          >
            <SettingsIcon size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
