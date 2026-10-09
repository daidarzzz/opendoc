// Layout: sidebar + área central + Command Palette.
import { useCallback, useEffect, useState } from "react";
import { CatalogView } from "./components/CatalogView";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { TabsBar } from "./components/TabsBar";
import { Viewer } from "./components/Viewer";
import { useGlobalKeys } from "./hooks/useGlobalKeys";
import { useCatalog } from "./store/catalog";
import { useDocsets } from "./store/docsets";
import { useTheme } from "./store/theme";

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
  const view = useCatalog((s) => s.view);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth);
  useGlobalKeys();

  const resizeSidebar = useCallback((clientX: number) => {
    const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, window.innerWidth - 320));
    setSidebarWidth(Math.round(Math.max(SIDEBAR_MIN, Math.min(max, clientX))));
  }, []);

  // Arranque: tema guardado (con anti-flash ya aplicado) + carpeta guardada.
  useEffect(() => {
    void initTheme();
    void initDocsets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // El ajuste sigue activo durante esta sesión aunque el storage no esté disponible.
    }
  }, [sidebarWidth]);

  return (
    <div className="flex h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Sidebar style={{ width: sidebarWidth, flexBasis: sidebarWidth }} />
      <div
        role="separator"
        aria-label="Cambiar ancho del panel lateral"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        className="group z-10 -ml-[3px] -mr-[2px] flex w-[5px] shrink-0 cursor-col-resize touch-none items-center justify-center outline-none focus-visible:bg-blue-500/30"
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
        <span className="h-8 w-px rounded bg-gray-300 transition-colors group-hover:bg-gray-500 group-focus-visible:bg-blue-500 dark:bg-gray-700 dark:group-hover:bg-gray-500" />
      </div>
      {/* La cabecera vive fuera del visor para que nunca se desmonte al
          cambiar de página o alternar entre visor y catálogo. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsBar />
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
