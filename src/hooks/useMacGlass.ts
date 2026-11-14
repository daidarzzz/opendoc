import { useLayoutEffect } from "react";
import { syncMacGlass } from "../lib/commands";
import type { MacGlassState, ThemeMode } from "../lib/types";

// Liquid Glass en macOS 26: AppKit pinta un fondo vibrante para toda la
// ventana y un panel de cristal (NSGlassEffectView) detrás de la barra
// lateral. Todo lo demás (pestañas, botones, ajustes) es HTML/CSS: los
// controles nativos superpuestos no casaban con el layout web.
type Item = MacGlassState["items"][number];
const SIDEBAR_ID = 1;

function sidebarItem(): Item | null {
  const element = document.querySelector<HTMLElement>('[data-mac-surface="sidebar"]');
  if (!element || element.closest("[inert]")) return null;
  const panel = element.querySelector<HTMLElement>("[data-mac-glass-panel]") ?? element;
  const rect = panel.getBoundingClientRect();
  const outer = element.getBoundingClientRect();
  // Mientras se pliega, el panel se recorta con el aside.
  const x = Math.max(rect.left, outer.left);
  const width = Math.min(rect.right, outer.right) - x;
  if (width < 24 || rect.height < 24) return null;
  return {
    id: SIDEBAR_ID,
    kind: "sidebar",
    x,
    y: rect.top,
    width,
    height: rect.height,
    model: { id: SIDEBAR_ID, kind: "sidebar", label: "", symbol: "", disabled: false, selected: false },
  };
}

export function useMacGlass(enabled: boolean, appearance: ThemeMode, layoutReady: boolean): void {
  useLayoutEffect(() => {
    if (!enabled || !layoutReady) return;

    let frame = 0;
    let disposed = false;
    let inFlight = false;
    let pending = false;
    let last = "";
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(sync);
    };
    const sync = () => {
      frame = 0;
      if (inFlight) {
        pending = true;
        return;
      }
      const item = sidebarItem();
      const state: MacGlassState = { enabled: true, appearance, items: item ? [item] : [] };
      const signature = JSON.stringify(state);
      if (signature === last) return;

      inFlight = true;
      void syncMacGlass(state)
        .then(() => {
          if (!disposed) last = signature;
        })
        .catch((error: unknown) => {
          console.error("AppKit glass synchronization failed", error);
        })
        .finally(() => {
          inFlight = false;
          if (pending) {
            pending = false;
            schedule();
          }
        });
    };

    // Durante el plegado animado el ancho cambia en cada frame.
    let animating = 0;
    const follow = () => {
      schedule();
      if (animating) animating = requestAnimationFrame(follow);
    };
    const onTransitionStart = (event: TransitionEvent) => {
      if (event.propertyName === "width" && !animating) animating = requestAnimationFrame(follow);
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "width") return;
      cancelAnimationFrame(animating);
      animating = 0;
      schedule();
    };

    const changes = new MutationObserver(schedule);
    changes.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["inert", "style", "data-mac-surface"],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener("resize", schedule);
    document.addEventListener("transitionstart", onTransitionStart, true);
    document.addEventListener("transitionend", onTransitionEnd, true);
    schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(animating);
      changes.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("transitionstart", onTransitionStart, true);
      document.removeEventListener("transitionend", onTransitionEnd, true);
      void syncMacGlass({ enabled: false, appearance: "system", items: [] }).catch(console.error);
    };
  }, [enabled, appearance, layoutReady]);
}
