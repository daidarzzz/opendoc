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
      data-mac-surface={selected && !dragging ? "tab" : undefined}
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
      className={`group relative flex h-[34px] w-52 min-w-[7rem] shrink select-none touch-none cursor-default items-center gap-2 rounded-t-[var(--tab-r)] pl-3 pr-1.5 text-[13px] transition-colors duration-150 ease-smooth ${
        dragging
          ? "z-10 cursor-grabbing rounded-[var(--tab-r)] bg-card font-medium text-ink shadow-pop ring-1 ring-accent/30"
          : selected
            ? "tab-connected z-[1] bg-card font-medium text-ink"
            : "text-muted hover:text-ink"
      } ${unavailable ? "opacity-50" : ""}`}
    >
      {!selected && !dragging && (
        <span aria-hidden className="pointer-events-none absolute inset-x-1 bottom-1 top-1 rounded-lg transition-colors duration-150 group-hover:bg-canvas-2" />
      )}
      <span className="relative flex shrink-0">
        {isNew ? (
          <AppLogo size={15} />
        ) : isCatalog ? (
          <CatalogIcon size={15} className="text-accent-text" />
        ) : (
          <DocsetIcon icon={icon} name={docName} size={15} />
        )}
      </span>
      <span className="relative flex-1 truncate">{title}</span>
      <button
        aria-label={closeLabel}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-faint transition-all duration-150 hover:bg-ink/[0.08] hover:text-ink ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <CloseIcon size={12} strokeWidth={2} />
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
  // Arrastre: la pestaña sigue al puntero (transform en vivo, sin estado de
  // React por fotograma); al cruzar el centro de una vecina se reordena y
  // las demás se deslizan a su sitio (FLIP). Al soltar encaja con suavidad.
  const pointerDrag = useRef<{
    pointerId: number;
    fromId: string;
    startX: number;
    startY: number;
    dragging: boolean;
    /** Distancia del puntero al borde izquierdo de la pestaña al agarrarla. */
    grabOffset: number;
    /** Borde izquierdo deseado (coordenadas de la lista) en el último movimiento. */
    left: number;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const suppressClickId = useRef<string | null>(null);
  const flipPositions = useRef<Map<string, { left: number; top: number }> | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const tabElement = (id: string): HTMLElement | null =>
    listRef.current?.querySelector<HTMLElement>(`[data-opendoc-tab-id="${CSS.escape(id)}"]`) ?? null;

  /** Coloca la pestaña arrastrada en `left` (coordenadas de la lista). */
  const placeDragged = useCallback((id: string, left: number): void => {
    const el = tabElement(id);
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = `translateX(${left - el.offsetLeft}px)`;
  }, []);

  const moveWithAnimation = useCallback((id: string, destination: number): void => {
    const orderedTabs = useTabs.getState().tabs;
    const from = orderedTabs.findIndex((tab) => tab.id === id);
    if (from < 0 || from === destination) return;
    flipPositions.current = new Map(
      Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-opendoc-tab-id]") ?? [])
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
    const drag = pointerDrag.current;
    // La arrastrada no se anima: sigue al puntero desde su nuevo hueco.
    if (drag?.dragging) placeDragged(drag.fromId, drag.left);
    if (!previous) return;
    flipPositions.current = null;
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);

    const elements = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-opendoc-tab-id]") ?? []);
    const animated: HTMLElement[] = [];
    for (const element of elements) {
      const tabId = element.dataset.opendocTabId ?? "";
      if (drag?.dragging && tabId === drag.fromId) continue;
      const old = previous.get(tabId);
      if (!old) continue;
      const rect = element.getBoundingClientRect();
      const dx = old.left - rect.left;
      if (Math.abs(dx) < 0.5) continue;
      element.style.transition = "none";
      element.style.transform = `translateX(${dx}px)`;
      animated.push(element);
    }
    if (animated.length === 0) return;
    void document.body.offsetHeight;
    animationFrame.current = requestAnimationFrame(() => {
      for (const element of animated) {
        element.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
        element.style.transform = "";
      }
      animationFrame.current = null;
    });
  }, [tabs, placeDragged]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const drag = pointerDrag.current;
      const list = listRef.current;
      if (!drag || event.pointerId !== drag.pointerId || !list) return;
      if (!drag.dragging && Math.abs(event.clientX - drag.startX) < 5) return;
      const el = tabElement(drag.fromId);
      if (!el) return;
      if (!drag.dragging) {
        drag.dragging = true;
        setDraggingId(drag.fromId);
      }
      const listRect = list.getBoundingClientRect();
      const maxLeft = Math.max(0, list.scrollWidth - el.offsetWidth);
      const left = Math.min(maxLeft, Math.max(0, event.clientX - listRect.left + list.scrollLeft - drag.grabOffset));
      drag.left = left;
      placeDragged(drag.fromId, left);

      // Hueco de destino: cuántas pestañas (sin la arrastrada) quedan con
      // su centro a la izquierda del centro de la arrastrada.
      const center = left + el.offsetWidth / 2;
      const ordered = useTabs.getState().tabs;
      let destination = 0;
      for (const tab of ordered) {
        if (tab.id === drag.fromId) continue;
        const other = tabElement(tab.id);
        if (other && other.offsetLeft + other.offsetWidth / 2 < center) destination++;
      }
      moveWithAnimation(drag.fromId, destination);
    };

    const finish = (event: PointerEvent): void => {
      const drag = pointerDrag.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      pointerDrag.current = null;
      if (!drag.dragging) return;
      suppressClickId.current = drag.fromId;
      window.setTimeout(() => {
        if (suppressClickId.current === drag.fromId) suppressClickId.current = null;
      }, 0);
      // Encaje: de donde se soltó a su hueco.
      const el = tabElement(drag.fromId);
      if (el) {
        el.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "";
        window.setTimeout(() => {
          if (pointerDrag.current?.fromId !== drag.fromId) el.style.transition = "";
          setDraggingId((cur) => (cur === drag.fromId ? null : cur));
        }, 220);
      } else {
        setDraggingId(null);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [moveWithAnimation, placeDragged]);

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
    <div className="mac-tabs flex items-end gap-1 pl-1 pr-2 pt-2">
      <div className="mb-1 mr-2 flex items-center">
        {sidebarCollapsed && (
          <button
            data-mac-control data-mac-symbol="sidebar.left"
          aria-label={tr("settings.expandSidebar")}
            title={tr("settings.expandSidebar")}
            onClick={() => onExpandSidebar?.()}
            className="icon-btn animate-fade-in"
          >
            <PanelToggleIcon direction="right" />
          </button>
        )}
        <button
          data-mac-control data-mac-symbol="chevron.left"
          aria-label={tr("tabs.back")}
          title={tr("tabs.back")}
          disabled={!canBack}
          onClick={() => goBack()}
          className="icon-btn"
        >
          <ChevronIcon direction="left" size={17} />
        </button>
        <button
          data-mac-control data-mac-symbol="chevron.right"
          aria-label={tr("tabs.forward")}
          title={tr("tabs.forward")}
          disabled={!canForward}
          onClick={() => goForward()}
          className="icon-btn"
        >
          <ChevronIcon direction="right" size={17} />
        </button>
      </div>
      <div ref={listRef} role="tablist" aria-label={tr("tabs.list")} onKeyDown={onListKeyDown} className="relative flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                const rect = e.currentTarget.getBoundingClientRect();
                pointerDrag.current = {
                  pointerId: e.pointerId,
                  fromId: t.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  dragging: false,
                  grabOffset: e.clientX - rect.left,
                  left: (e.currentTarget as HTMLElement).offsetLeft,
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
        data-mac-control data-mac-symbol="plus"
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
