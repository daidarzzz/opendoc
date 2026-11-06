// Menú contextual propio: minimalista, con teclado completo (flechas,
// Intro, Esc), se recoloca para no salirse de la ventana y se cierra al
// hacer clic fuera, perder el foco, redimensionar o desplazar.
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../hooks/useT";
import { formatZoom } from "../lib/zoom";
import { useContextMenu, type MenuEntry, type MenuIcon } from "../store/contextMenu";
import { useZoom } from "../store/zoom";
import { CatalogIcon } from "./CatalogIcon";
import {
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  CutIcon,
  FindIcon,
  MinusIcon,
  NewTabIcon,
  PasteIcon,
  PlusIcon,
  SearchIcon,
  SelectAllIcon,
  UndoIcon,
  ZoomIcon,
} from "./Icons";

const EDGE = 8;

function iconFor(icon: MenuIcon | undefined): ReactNode {
  const p = { size: 15, className: "text-gray-400 group-data-[active=true]:text-accent-text dark:text-gray-500" };
  switch (icon) {
    case "copy": return <CopyIcon {...p} />;
    case "cut": return <CutIcon {...p} />;
    case "paste": return <PasteIcon {...p} />;
    case "select": return <SelectAllIcon {...p} />;
    case "search": return <SearchIcon {...p} />;
    case "find": return <FindIcon {...p} />;
    case "tab": return <NewTabIcon {...p} />;
    case "back": return <ChevronIcon direction="left" {...p} />;
    case "forward": return <ChevronIcon direction="right" {...p} />;
    case "close": return <CloseIcon {...p} />;
    case "reopen": return <UndoIcon {...p} />;
    case "catalog": return <CatalogIcon size={15} className={p.className} />;
    default: return <span className="w-[15px]" />;
  }
}

export function ContextMenu() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const { t } = useT();

  const selectable = menu
    ? menu.entries.map((e, i) => (e.kind === "item" && !e.disabled ? i : -1)).filter((i) => i >= 0)
    : [];

  // Posición: junto al puntero, volteando si no cabe.
  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    setActive(-1);
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = menu.x;
    let top = menu.y;
    if (left + w > vw - EDGE) left = Math.max(EDGE, menu.x - w);
    if (top + h > vh - EDGE) top = Math.max(EDGE, vh - h - EDGE);
    setPos({ left, top });
    el?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      close();
    };
    const onWheel = (e: WheelEvent) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const choose = (entry: MenuEntry) => {
    if (entry.kind !== "item" || entry.disabled) return;
    close();
    entry.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (selectable.length === 0) return;
      const at = selectable.indexOf(active);
      const next =
        e.key === "Home" ? 0
          : e.key === "End" ? selectable.length - 1
            : e.key === "ArrowDown" ? (at + 1) % selectable.length
              : (at - 1 + selectable.length) % selectable.length;
      setActive(selectable[next] ?? -1);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && active >= 0) {
      e.preventDefault();
      const entry = menu.entries[active];
      if (entry) choose(entry);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("menu.label")}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-[60] min-w-[13.5rem] max-w-[20rem] origin-top-left animate-menu-in select-none rounded-xl border border-gray-200/80 bg-white/95 p-1 text-[13px] shadow-float outline-none backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/95"
    >
      {menu.entries.map((entry, i) => {
        if (entry.kind === "separator") {
          return <div key={entry.id} role="separator" className="mx-2 my-1 h-px bg-gray-200/80 dark:bg-white/10" />;
        }
        if (entry.kind === "zoom") {
          return <ZoomRow key={entry.id} />;
        }
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={entry.disabled}
            data-active={active === i}
            onPointerEnter={() => setActive(entry.disabled ? -1 : i)}
            onPointerLeave={() => setActive(-1)}
            onClick={() => choose(entry)}
            className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-gray-700 transition-colors duration-75 disabled:opacity-40 data-[active=true]:bg-accent/10 data-[active=true]:text-gray-900 dark:text-gray-200 dark:data-[active=true]:text-white"
          >
            {iconFor(entry.icon)}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.hint && (
              <span className="shrink-0 pl-4 text-[11px] text-gray-400 dark:text-gray-500">{entry.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const ZoomRow = memo(function ZoomRow() {
  const level = useZoom((s) => s.level);
  const { t } = useT();
  const btn =
    "flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white";
  return (
    <div className="flex items-center gap-2.5 px-2 py-1 text-gray-700 dark:text-gray-200">
      <ZoomIcon size={15} className="text-gray-400 dark:text-gray-500" />
      <span className="flex-1">{t("menu.zoom")}</span>
      <div className="flex items-center gap-0.5 rounded-lg bg-gray-100/80 p-0.5 dark:bg-white/5">
        <button type="button" aria-label={t("menu.zoomOut")} title={t("menu.zoomOut")} className={btn} onClick={() => useZoom.getState().zoomOut()}>
          <MinusIcon size={13} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label={t("menu.zoomReset")}
          title={t("menu.zoomReset")}
          onClick={() => useZoom.getState().reset()}
          className="min-w-[3rem] rounded-md px-1 text-center text-[12px] font-medium tabular-nums text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
        >
          {formatZoom(level)}
        </button>
        <button type="button" aria-label={t("menu.zoomIn")} title={t("menu.zoomIn")} className={btn} onClick={() => useZoom.getState().zoomIn()}>
          <PlusIcon size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
});
