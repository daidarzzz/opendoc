// Barra lateral: árbol de navegación, pendientes y versión. Los ajustes
// viven en su propio panel (SettingsDialog), que se abre desde aquí.
import { BrowseTree } from "./BrowseTree";
import { AppLogo } from "./AppLogo";
import { DocsetIcon } from "./DocsetIcon";
import { PanelToggleIcon } from "./PanelToggleIcon";
import { SettingsIcon } from "./Icons";
import { useT } from "../hooks/useT";
import { useDocsets } from "../store/docsets";
import { useSettingsUi } from "../store/settingsUi";
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
  /** Ocultar el panel (botón junto a Ajustes). */
  onCollapse: () => void;
  /** Transición de ancho activa (solo al plegar/desplegar, nunca al arrastrar). */
  animate: boolean;
}) {
  const { t } = useT();
  const { pending, extractingIds, extract } = useDocsets();

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
            onClick={() => useSettingsUi.getState().show()}
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
                      <DocsetIcon icon={p.icon} name={p.name} hint={p.id} />
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
