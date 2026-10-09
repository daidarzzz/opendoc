// Barra de pestañas (v0.2 V2-3): atrás/adelante, tablist accesible,
// cerrar, nueva pestaña y reordenar por arrastre.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import { canGoBack, canGoForward, currentEntry } from "../lib/tabHistory";
import { DocsetIcon } from "./DocsetIcon";

const TabButton = memo(function TabButton({
  id,
  title,
  icon,
  docName,
  selected,
  onActivate,
  onClose,
  onPointerDown,
  dragging,
}: {
  id: string;
  title: string;
  icon: string | null;
  docName: string;
  selected: boolean;
  onActivate: () => void;
  onClose: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  dragging: boolean;
}) {
  return (
    <div
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls="viewer-panel"
      data-opendoc-tab-id={id}
      tabIndex={selected ? 0 : -1}
      title={title}
      onPointerDown={onPointerDown}
      onClick={onActivate}
      onAuxClick={(e) => {
        // Clic central sobre la pestaña: la cierra.
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      // preventDefault en mousedown: sin esto Windows activa el autoscroll
      // y el auxclick puede no llegar.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={`relative flex max-w-44 select-none touch-none cursor-default items-center gap-1.5 rounded-t border-l-2 px-2 py-1.5 text-xs ${
        selected
          ? "border-transparent bg-white font-medium dark:bg-gray-900"
          : "border-transparent text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800"
      } ${dragging ? "z-10 bg-white shadow-lg dark:bg-gray-800" : ""}`}
    >
      <DocsetIcon icon={icon} name={docName} size={14} />
      <span className="flex-1 truncate">{title}</span>
      <button
        aria-label={`Cerrar pestaña ${title}`}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="rounded px-1 text-gray-400 hover:bg-gray-300 hover:text-gray-700 dark:hover:bg-gray-700"
      >
        ×
      </button>
    </div>
  );
});

export function TabsBar() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const activateTab = useTabs((s) => s.activateTab);
  const closeTab = useTabs((s) => s.closeTab);
  const newTab = useTabs((s) => s.newTab);
  const goBack = useTabs((s) => s.goBack);
  const goForward = useTabs((s) => s.goForward);
  const docsets = useDocsets((s) => s.docsets);
  const pointerDrag = useRef<{
    pointerId: number;
    fromId: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickId = useRef<string | null>(null);
  const flipPositions = useRef<Map<string, { left: number; top: number }> | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const moveWithAnimation = useCallback((id: string, destination: number): void => {
    const orderedTabs = useTabs.getState().tabs;
    const from = orderedTabs.findIndex((tab) => tab.id === id);
    if (from < 0 || from === destination) return;
    flipPositions.current = new Map(
      Array.from(document.querySelectorAll<HTMLElement>("[data-opendoc-tab-id]"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return [element.dataset.opendocTabId ?? "", { left: rect.left, top: rect.top }] as const;
        })
        .filter(([tabId]) => tabId !== ""),
    );
    useTabs.getState().moveTab(id, destination);
  }, []);

  useLayoutEffect(() => {
    const previous = flipPositions.current;
    if (!previous) return;
    flipPositions.current = null;
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);

    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-opendoc-tab-id]"));
    const animated: HTMLElement[] = [];
    for (const element of elements) {
      const old = previous.get(element.dataset.opendocTabId ?? "");
      if (!old) continue;
      const rect = element.getBoundingClientRect();
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      element.style.transition = "none";
      element.style.transform = `translate(${dx}px, ${dy}px)`;
      animated.push(element);
    }
    if (animated.length === 0) return;
    void document.body.offsetHeight;
    animationFrame.current = requestAnimationFrame(() => {
      for (const element of animated) {
        element.style.transition = "transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        element.style.transform = "translate(0, 0)";
      }
      animationFrame.current = null;
    });
  }, [tabs]);

  useEffect(() => {
    const reorderAtPointer = (drag: NonNullable<typeof pointerDrag.current>, event: PointerEvent): void => {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-opendoc-tab-id]");
      const targetId = target?.dataset.opendocTabId;
      if (!target || !targetId || targetId === drag.fromId) return;
      const orderedTabs = useTabs.getState().tabs;
      const targetIndex = orderedTabs.findIndex((tab) => tab.id === targetId);
      const fromIndex = orderedTabs.findIndex((tab) => tab.id === drag.fromId);
      if (targetIndex < 0 || fromIndex < 0) return;
      const rect = target.getBoundingClientRect();
      const insertionIndex = targetIndex + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0);
      const destination = Math.min(
        orderedTabs.length - 1,
        insertionIndex - (insertionIndex > fromIndex ? 1 : 0),
      );
      moveWithAnimation(drag.fromId, destination);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const drag = pointerDrag.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.dragging = true;
      setDraggingId(drag.fromId);
      reorderAtPointer(drag, event);
    };

    const onPointerUp = (event: PointerEvent): void => {
      const drag = pointerDrag.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      pointerDrag.current = null;
      setDraggingId(null);
      if (drag.dragging) {
        suppressClickId.current = drag.fromId;
        window.setTimeout(() => {
          if (suppressClickId.current === drag.fromId) suppressClickId.current = null;
        }, 0);
      }
      // También trata un pequeño movimiento que no haya cruzado otro tab.
      if (!drag.dragging) return;
      reorderAtPointer(drag, event);
    };

    const onPointerCancel = (event: PointerEvent): void => {
      if (pointerDrag.current?.pointerId === event.pointerId) pointerDrag.current = null;
      setDraggingId(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [moveWithAnimation]);

  const meta = useMemo(() => {
    const map = new Map<string, { icon: string | null; name: string }>();
    for (const d of docsets) map.set(d.id, { icon: d.icon, name: d.name });
    return map;
  }, [docsets]);

  const active = tabs.find((t) => t.id === activeId);
  const canBack = active ? canGoBack(active) : false;
  const canForward = active ? canGoForward(active) : false;

  const onListKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeId);
    const next =
      e.key === "ArrowRight"
        ? tabs[(idx + 1) % tabs.length]
        : tabs[(idx - 1 + tabs.length) % tabs.length];
    if (next) activateTab(next.id);
  };

  return (
    <div className="flex items-end gap-1 border-b border-gray-200 bg-gray-50 px-2 pt-1 dark:border-gray-800 dark:bg-gray-950">
      <button
        aria-label="Atrás (Alt+←)"
        title="Atrás (Alt+←)"
        disabled={!canBack}
        onClick={() => goBack()}
        className="rounded px-2 py-1.5 text-sm text-gray-600 disabled:opacity-30 dark:text-gray-300"
      >
        ←
      </button>
      <button
        aria-label="Adelante (Alt+→)"
        title="Adelante (Alt+→)"
        disabled={!canForward}
        onClick={() => goForward()}
        className="rounded px-2 py-1.5 text-sm text-gray-600 disabled:opacity-30 dark:text-gray-300"
      >
        →
      </button>
      <div role="tablist" aria-label="Pestañas" onKeyDown={onListKeyDown} className="flex flex-1 items-end gap-0.5 overflow-x-auto">
        {tabs.map((t) => {
          const m = meta.get(t.docsetId);
          return (
            <TabButton
              key={t.id}
              id={t.id}
              title={currentEntry(t)?.title ?? "Nueva pestaña"}
              icon={m?.icon ?? null}
              docName={m?.name ?? t.docsetId}
              selected={t.id === activeId}
              onClose={() => closeTab(t.id)}
              onPointerDown={(e) => {
                if (!e.isPrimary || e.button !== 0 || (e.target instanceof Element && e.target.closest("button"))) return;
                pointerDrag.current = {
                  pointerId: e.pointerId,
                  fromId: t.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  dragging: false,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              dragging={draggingId === t.id}
              onActivate={() => {
                if (suppressClickId.current === t.id) {
                  suppressClickId.current = null;
                  return;
                }
                activateTab(t.id);
              }}
            />
          );
        })}
      </div>
      <button
        aria-label="Nueva pestaña"
        title="Nueva pestaña"
        onClick={() => {
          newTab();
          usePalette.getState().setOpen(true);
        }}
        className="rounded px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300"
      >
        +
      </button>
    </div>
  );
}
