// Barra de pestañas (v0.2 V2-3): atrás/adelante, tablist accesible,
// cerrar, nueva pestaña y reordenar por arrastre.
import { memo, useMemo, useRef } from "react";
import { useDocsets } from "../store/docsets";
import { useTabs } from "../store/tabs";
import { DocsetIcon } from "./DocsetIcon";

const TabButton = memo(function TabButton({
  id,
  title,
  icon,
  docName,
  selected,
  onActivate,
  onClose,
  onDragStart,
  onDrop,
}: {
  id: string;
  title: string;
  icon: string | null;
  docName: string;
  selected: boolean;
  onActivate: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls="viewer-panel"
      tabIndex={selected ? 0 : -1}
      title={title}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={`flex max-w-44 cursor-pointer items-center gap-1.5 rounded-t px-2 py-1.5 text-xs ${
        selected
          ? "bg-white font-medium dark:bg-gray-900"
          : "text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800"
      }`}
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
  const moveTab = useTabs((s) => s.moveTab);
  const newTab = useTabs((s) => s.newTab);
  const goBack = useTabs((s) => s.goBack);
  const goForward = useTabs((s) => s.goForward);
  const docsets = useDocsets((s) => s.docsets);
  const dragId = useRef<string | null>(null);

  const meta = useMemo(() => {
    const map = new Map<string, { icon: string | null; name: string }>();
    for (const d of docsets) map.set(d.id, { icon: d.icon, name: d.name });
    return map;
  }, [docsets]);

  const active = tabs.find((t) => t.id === activeId);
  const canBack = (active?.past.length ?? 0) > 0;
  const canForward = (active?.future.length ?? 0) > 0;

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
              title={t.current?.title ?? "Nueva pestaña"}
              icon={m?.icon ?? null}
              docName={m?.name ?? t.docsetId}
              selected={t.id === activeId}
              onActivate={() => activateTab(t.id)}
              onClose={() => closeTab(t.id)}
              onDragStart={(e) => {
                dragId.current = t.id;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId.current;
                dragId.current = null;
                if (from && from !== t.id) {
                  moveTab(from, tabs.findIndex((x) => x.id === t.id));
                }
              }}
            />
          );
        })}
      </div>
      <button
        aria-label="Nueva pestaña"
        title="Nueva pestaña"
        onClick={() => newTab()}
        className="rounded px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300"
      >
        +
      </button>
    </div>
  );
}
