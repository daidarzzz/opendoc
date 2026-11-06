// Barra de pestañas (v0.2 V2-3): atrás/adelante, tablist accesible,
// cerrar, nueva pestaña y reordenar por arrastre.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "../hooks/useT";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import { canGoBack, canGoForward, currentEntry } from "../lib/tabHistory";
import { AppLogo } from "./AppLogo";
import { DocsetIcon } from "./DocsetIcon";
import { PanelToggleIcon } from "./PanelToggleIcon";
import { CatalogIcon } from "./CatalogIcon";
import { ChevronIcon, CloseIcon, PlusIcon } from "./Icons";

const TabButton = memo(function TabButton({
  id,
  title,
  icon,
  docName,
  isNew,
  isCatalog,
  selected,
  onActivate,
  onClose,
  onPointerDown,
  dragging,
  unavailable,
  closeLabel,
}: {
  id: string;
  title: string;
  icon: string | null;
  docName: string;
  /** Pestaña nueva y vacía: logo de OpenDoc en vez del icono genérico. */
  isNew: boolean;
  /** Es la pestaña de catálogo. */
  isCatalog: boolean;
  selected: boolean;
  onActivate: () => void;
  onClose: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  dragging: boolean;
  /** El docset no está cargado (o es un tarix sin instalar): atenuada. */
  unavailable: boolean;
  /** Etiqueta accesible del botón cerrar (ya traducida). */
  closeLabel: string;
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
      className={`group relative flex h-8 w-44 min-w-[6rem] shrink select-none touch-none cursor-default items-center gap-2 rounded-t-lg pl-2.5 pr-1 text-xs transition-colors duration-150 ease-smooth ${
        selected
          ? "z-[1] bg-white font-medium text-gray-900 shadow-[0_-1px_0_0_rgb(0_0_0/0.04),1px_0_0_0_rgb(0_0_0/0.05),-1px_0_0_0_rgb(0_0_0/0.05)] dark:bg-gray-900 dark:text-gray-100 dark:shadow-[1px_0_0_0_rgb(255_255_255/0.05),-1px_0_0_0_rgb(255_255_255/0.05)]"
          : "text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
      } ${dragging ? "z-10 bg-white shadow-float dark:bg-gray-800" : ""} ${unavailable ? "opacity-50" : ""}`}
    >
      {selected && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2 rounded-t-lg border-t-2 border-accent-text" />
      )}
      {isNew ? (
        <AppLogo size={14} />
      ) : isCatalog ? (
        <CatalogIcon size={14} />
      ) : (
        <DocsetIcon icon={icon} name={docName} size={14} />
      )}
      <span className="flex-1 truncate">{title}</span>
      <button
        aria-label={closeLabel}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-all duration-150 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-100 ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <CloseIcon size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
});

export function TabsBar({
  sidebarCollapsed = false,
  onExpandSidebar,
}: {
  /** Panel lateral oculto: se muestra el botón para recuperarlo. */
  sidebarCollapsed?: boolean;
  /** Mostrar el panel lateral. */
  onExpandSidebar?: () => void;
}) {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const activateTab = useTabs((s) => s.activateTab);
  const closeTab = useTabs((s) => s.closeTab);
  const newTab = useTabs((s) => s.newTab);
  const goBack = useTabs((s) => s.goBack);
  const goForward = useTabs((s) => s.goForward);
  const docsets = useDocsets((s) => s.docsets);
  const pending = useDocsets((s) => s.pending);
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
  // Deshabilitar atrás/adelante para pestañas de catálogo
  const isCatalog = active?.type === "catalog";
  const canBack = active && !isCatalog ? canGoBack(active) : false;
  const canForward = active && !isCatalog ? canGoForward(active) : false;
  const { t: tr } = useT();

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
    <div className="flex items-end gap-1 border-b border-gray-200/80 bg-gray-50/80 px-2 pt-1.5 dark:border-white/5 dark:bg-gray-950">
      <div className="mb-1 flex items-center gap-0.5">
        {sidebarCollapsed && (
          <button
            aria-label={tr("settings.expandSidebar")}
            title={tr("settings.expandSidebar")}
            onClick={() => onExpandSidebar?.()}
            className="icon-btn animate-fade-in"
          >
            <PanelToggleIcon direction="right" />
          </button>
        )}
        <button
          aria-label={tr("tabs.back")}
          title={tr("tabs.back")}
          disabled={!canBack}
          onClick={() => goBack()}
          className="icon-btn"
        >
          <ChevronIcon direction="left" size={17} />
        </button>
        <button
          aria-label={tr("tabs.forward")}
          title={tr("tabs.forward")}
          disabled={!canForward}
          onClick={() => goForward()}
          className="icon-btn"
        >
          <ChevronIcon direction="right" size={17} />
        </button>
      </div>
      <div role="tablist" aria-label={tr("tabs.list")} onKeyDown={onListKeyDown} className="-mb-px flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const isCatalogTab = t.type === "catalog";
          const m = meta.get(t.docsetId);
          const hasContent = currentEntry(t) !== null;
          const unavailable =
            !isCatalogTab &&
            hasContent &&
            t.docsetId !== "" &&
            !meta.has(t.docsetId) &&
            !pending.some((p) => p.id === t.docsetId);
          const pendingInstall =
            !isCatalogTab && hasContent && t.docsetId !== "" && pending.some((p) => p.id === t.docsetId);
          const tabTitle = isCatalogTab ? tr("catalog.title") : (currentEntry(t)?.title ?? tr("tabs.newTab"));
          return (
            <TabButton
              key={t.id}
              id={t.id}
              title={tabTitle}
              icon={isCatalogTab ? null : m?.icon ?? null}
              docName={isCatalogTab ? tr("catalog.title") : (m?.name ?? t.docsetId)}
              isNew={!hasContent && !isCatalogTab}
              isCatalog={isCatalogTab}
              selected={t.id === activeId}
              unavailable={unavailable || pendingInstall}
              closeLabel={tr("tabs.closeTab", { title: tabTitle })}
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
        aria-label={tr("tabs.newTab")}
        title={tr("tabs.newTab")}
        onClick={() => {
          newTab();
          usePalette.getState().setOpen(true);
        }}
        className="icon-btn mb-1"
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}
