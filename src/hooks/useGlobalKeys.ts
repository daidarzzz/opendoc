// Atajos globales (sin choques: todo con modificador; WebView2 no usa
// estas teclas al no tener chrome de navegador con pestañas).
// - Ctrl/Cmd+K: paleta. Ctrl+W: cerrar pestaña. Ctrl+Tab/Shift: cambiar.
//   Ctrl/Cmd+1..9: saltar. Alt+←/→: atrás/adelante.
// El foco dentro del iframe no llega aquí: el script inyectado reenvía
// esas mismas teclas por postMessage (ver Viewer).
import { useEffect } from "react";
import { matchParentShortcut } from "../lib/iframeMessages";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";

export function useGlobalKeys() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePalette.getState().toggle();
        return;
      }
      if (e.defaultPrevented) return;
      const hit = matchParentShortcut(e);
      if (!hit) return;
      e.preventDefault();
      const tabs = useTabs.getState();
      if (hit.action === "close-tab") {
        tabs.closeTab(tabs.activeId);
      } else if (hit.action === "next-tab" || hit.action === "prev-tab") {
        const list = tabs.tabs;
        const idx = list.findIndex((t) => t.id === tabs.activeId);
        const next =
          hit.action === "next-tab"
            ? list[(idx + 1) % list.length]
            : list[(idx - 1 + list.length) % list.length];
        if (next) tabs.activateTab(next.id);
      } else if (hit.action === "tab-n" && hit.index !== undefined) {
        const target = tabs.tabs[hit.index];
        if (target) tabs.activateTab(target.id);
      } else if (hit.action === "back") {
        tabs.goBack();
      } else if (hit.action === "forward") {
        tabs.goForward();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
