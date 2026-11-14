import { useLayoutEffect } from "react";
import { syncMacGlass } from "../lib/commands";
import type { MacGlassState, ThemeMode } from "../lib/types";

type Item = MacGlassState["items"][number];
const MAX_ITEMS = 96;
const ids = new WeakMap<HTMLElement, number>();
let nextId = 0;

function buildItem(element: HTMLElement, kind: Item["kind"]): Item | null {
  let id = ids.get(element);
  if (id === undefined) {
    id = ++nextId;
    ids.set(element, id);
  }
  const rect = element.getBoundingClientRect();
  const clip = kind === "tab" ? element.parentElement?.getBoundingClientRect() : undefined;
  const inset = kind === "sidebar" ? 5 : 0;
  const x = Math.max(rect.left + inset, clip?.left ?? 0);
  const y = Math.max(rect.top + inset, 0);
  const width = Math.min(rect.right - inset, clip?.right ?? window.innerWidth) - x;
  const height = Math.min(rect.bottom - inset, window.innerHeight) - y;
  if (width < 1 || height < 1 || element.closest("[inert]")) return null;

  if (kind === "button" || kind === "switch") {
    if (width < rect.width - 0.5 || height < rect.height - 0.5) return null;
    // Exclude offscreen and partially clipped rows in settings. The original
    // button remains available until it can be covered at its full size.
    const hit = document.elementFromPoint(x + width / 2, y + height / 2);
    if (!hit || !element.contains(hit)) return null;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.overflowY === "visible" && style.overflowX === "visible") continue;
      const rect = parent.getBoundingClientRect();
      if (style.overflowY !== "visible" && (y < rect.top - 0.5 || y + height > rect.bottom + 0.5)) return null;
      if (style.overflowX !== "visible" && (x < rect.left - 0.5 || x + width > rect.right + 0.5)) return null;
    }
  }

  return {
    id, kind, x, y, width, height,
    model: {
      id, kind,
      label: kind === "sidebar" || kind === "tab"
        ? ""
        : element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "",
      symbol: element.dataset.macSymbol ?? "",
      disabled: element.matches(":disabled"),
      selected: element.matches('[aria-checked="true"],[aria-pressed="true"],[aria-current="page"]'),
    },
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
    let currentButtons = new Map<number, HTMLElement>();
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(sync);
    };
    const sync = () => {
      frame = 0;
      if (inFlight) {
        pending = true;
        return;
      }
      const items: Item[] = [];
      const buttons = new Map<number, HTMLElement>();
      const dialog = document.querySelector("[data-mac-settings]");
      const modal = document.querySelector(".backdrop, [role='menu']");
      const candidates = document.querySelectorAll<HTMLElement>(
        '[data-mac-surface], [data-mac-control], [data-mac-settings] button.btn, [data-mac-settings] button.btn-primary',
      );

      for (const element of candidates) {
        if (items.length >= MAX_ITEMS) break;
        const surface = element.dataset.macSurface;
        const kind = surface === "sidebar" || surface === "tab"
          ? surface : element.getAttribute("role") === "switch" ? "switch" : "button";
        if (modal && !surface && (!dialog || !dialog.contains(element))) continue;
        const item = buildItem(element, kind);
        if (!item) continue;
        if (!surface) {
          item.model.label ||= element.textContent?.trim() ?? "";
          if (!item.model.label) continue;
          buttons.set(item.id, element);
        }
        items.push(item);
      }
      const state = { enabled: true, appearance, items };
      const signature = JSON.stringify(state);
      if (signature === last) return;

      inFlight = true;
      void syncMacGlass(state).then(() => {
        if (disposed) return;
        last = signature;
        for (const [id, button] of currentButtons) {
          if (!buttons.has(id)) delete button.dataset.macRendered;
        }
        for (const button of buttons.values()) button.dataset.macRendered = "true";
        currentButtons = buttons;
      }).catch((error: unknown) => {
        console.error("AppKit overlay synchronization failed", error);
      }).finally(() => {
        inFlight = false;
        if (pending) {
          pending = false;
          schedule();
        }
      });
    };

    const onControl = (event: Event) => {
      const button = currentButtons.get((event as CustomEvent<number>).detail);
      if (button?.isConnected) button.click();
    };
    const changes = new MutationObserver(schedule);
    changes.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["class", "style", "inert", "disabled", "aria-checked", "aria-pressed", "aria-label", "aria-selected", "aria-current", "data-mac-surface", "title"],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener("opendoc:mac-control", onControl);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("animationend", schedule, true);
    document.addEventListener("transitionend", schedule, true);
    schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      changes.disconnect();
      resize.disconnect();
      window.removeEventListener("opendoc:mac-control", onControl);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      document.removeEventListener("transitionend", schedule, true);
      for (const button of currentButtons.values()) delete button.dataset.macRendered;
      void syncMacGlass({ enabled: false, appearance: "system", items: [] }).catch(console.error);
    };
  }, [enabled, appearance, layoutReady]);
}
