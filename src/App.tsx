// Layout: sidebar + área central + Command Palette.
import { useCallback, useEffect, useState } from "react";
import { CatalogView } from "./components/CatalogView";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { TabsBar } from "./components/TabsBar";
import { Viewer } from "./components/Viewer";
import { useGlobalKeys } from "./hooks/useGlobalKeys";
import { destroyWindow, onCloseRequested, onExitRequested, confirmExit } from "./lib/commands";
import {
  CLOSE_SAVE_TIMEOUT_MS,
  flushSessionForClose,
  hydrateSessionOnce,
  startSessionSync,
} from "./lib/sessionSync";
import { useCatalog } from "./store/catalog";
import { useDocsets } from "./store/docsets";
import { useLang } from "./store/lang";
import { useTheme } from "./store/theme";
import { useAccent } from "./store/accent";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "./lib/sidebar";
import { useT } from "./hooks/useT";
import { t as translate } from "./lib/i18n";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_STORAGE_KEY = "opendoc.sidebarWidth";

function initialSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX
      ? stored
      : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export default function App() {
  const initDocsets = useDocsets((s) => s.init);
  const initTheme = useTheme((s) => s.init);
  const initLang = useLang((s) => s.init);
  const initAccent = useAccent((s) => s.init);
  const langLoaded = useLang((s) => s.loaded);
  const view = useCatalog((s) => s.view);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const { t } = useT();
  useGlobalKeys();

  const resizeSidebar = useCallback((clientX: number) => {
    const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, window.innerWidth - 320));
    setSidebarWidth(Math.round(Math.max(SIDEBAR_MIN, Math.min(max, clientX))));
  }, []);

  // Arranque: tema e idioma guardados (con anti-flash ya aplicado) +
  // carpeta guardada. No se pinta texto hasta cargar el idioma.
  // Tras el escaneo se hidratan las pestañas (nunca antes: la bienvenida
  // inicial no debe pisar session.json). El cierre vuelca el último estado
  // con tope para no colgar la ventana (ver sessionSync).
  useEffect(() => {
    void initTheme();
    void initLang();
    void initAccent();
    let alive = true;
    const stopSync = startSessionSync();
    void (async () => {
      await initDocsets();
      if (alive) await hydrateSessionOnce();
    })();
    let closing = false;
    let unlistenClose: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    // Salida pedida al SO (Cmd+Q en macOS): no pasa por onCloseRequested.
    // Se vuelca la sesión y se confirma; el backend sale solo si no hay
    // respuesta (hilo de respaldo).
    void (async () => {
      try {
        unlistenExit = await onExitRequested(async () => {
          try {
            await Promise.race([
              flushSessionForClose(),
              new Promise((r) => setTimeout(r, CLOSE_SAVE_TIMEOUT_MS)),
            ]);
          } catch {
            // Un fallo al salir no bloquea la salida (el debounce acota).
          }
          try {
            await confirmExit();
          } catch {
            // El hilo de respaldo del backend sale solo.
          }
        });
      } catch {
        // Fuera de Tauri (navegador): sin guardado al salir.
      }
    })();
    void (async () => {
      try {
        unlistenClose = await onCloseRequested(async (e) => {
          if (closing) return;
          closing = true;
          e.preventDefault();
          try {
            await Promise.race([
              flushSessionForClose(),
              new Promise((r) => setTimeout(r, CLOSE_SAVE_TIMEOUT_MS)),
            ]);
          } catch {
            // Un fallo al cerrar no bloquea el cierre (el debounce acota).
          }
          try {
            await destroyWindow();
          } catch (err) {
            // Sin esto la ventana quedaría bloqueada (el backend ya canceló
            // el cierre nativo al existir este listener): se permite reintentar.
            closing = false;
            console.error(
              `[opendoc] ${translate(useLang.getState().lang, "app.closeFailed")}`,
              err,
            );
          }
        });
      } catch {
        // Fuera de Tauri (navegador): sin guardado al cerrar.
      }
    })();
    return () => {
      alive = false;
      stopSync();
      if (unlistenClose) unlistenClose();
      if (unlistenExit) unlistenExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // El ajuste sigue activo durante esta sesión aunque el storage no esté disponible.
    }
  }, [sidebarWidth]);

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  if (!langLoaded) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Sidebar
        style={{ width: sidebarWidth, flexBasis: sidebarWidth }}
        collapsed={sidebarCollapsed}
        expandedWidth={sidebarWidth}
        onCollapse={() => setSidebarCollapsed(true)}
      />
      {!sidebarCollapsed && (
      <div
        role="separator"
        aria-label={t("app.resizeSidebar")}
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        className="group z-10 -ml-[3px] -mr-[2px] flex w-[5px] shrink-0 cursor-col-resize touch-none items-center justify-center outline-none focus-visible:bg-accent/30"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeSidebar(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            resizeSidebar(event.clientX);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            resizeSidebar(sidebarWidth + (event.key === "ArrowRight" ? 16 : -16));
          } else if (event.key === "Home") {
            event.preventDefault();
            resizeSidebar(SIDEBAR_MIN);
          } else if (event.key === "End") {
            event.preventDefault();
            resizeSidebar(SIDEBAR_MAX);
          }
        }}
      >
        <span className="h-8 w-px rounded bg-gray-300 transition-colors group-hover:bg-gray-500 group-focus-visible:bg-accent-text dark:bg-gray-700 dark:group-hover:bg-gray-500" />
      </div>
      )}
      {/* La cabecera vive fuera del visor para que nunca se desmonte al
          cambiar de página o alternar entre visor y catálogo. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsBar
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
        />
        <div
          className={
            view === "catalog"
              ? "hidden min-h-0 min-w-0 flex-1"
              : "flex min-h-0 min-w-0 flex-1"
          }
        >
          <Viewer />
        </div>
        {view === "catalog" && (
          <div className="flex min-h-0 min-w-0 flex-1">
            <CatalogView />
          </div>
        )}
      </div>
      <CommandPalette />
    </div>
  );
}
