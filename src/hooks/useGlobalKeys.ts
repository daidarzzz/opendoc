// Atajos globales (sin choques: todo con modificador; el webview no tiene
// chrome de navegador ni menú nativo con estas teclas).
// - Ctrl/Cmd+K: paleta. Ctrl+W: cerrar pestaña. Ctrl+Tab/Shift: cambiar.
//   Ctrl/Cmd+1..9: saltar. Alt+←/→: atrás/adelante.
// El foco dentro del iframe no llega aquí: el script inyectado reenvía
// esas mismas teclas por postMessage (ver Viewer).
// Nota macOS: Cmd+Tab lo roba el conmutador del SO (solo vale Ctrl+Tab).
import { useEffect } from "react";
import { matchParentShortcut } from "../lib/iframeMessages";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";

export function useGlobalKeys() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Composición IME en curso: no interferir (el docset la gestiona).
      if (e.isComposing || e.key === "Process") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePalette.getState().toggle();
        return;
      }
      // Con la paleta abierta nada actúa por debajo (salvo Ctrl/Cmd+K):
      // Enter/flechas/Tab/Escape ya los consume ella (defaultPrevented).
      if (usePalette.getState().open) return;
      if (e.defaultPrevented) return;
      const hit = matchParentShortcut(e);
      if (!hit) return;
      e.preventDefault();
      const tabs = useTabs.getState();
      if (hit.action === "close-tab") {
        tabs.closeTab(tabs.activeId);
      } else if (hit.action === "new-tab") {
        tabs.newTab();
        usePalette.getState().setOpen(true);
      } else if (hit.action === "reopen-tab") {
        tabs.reopenLast();
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
