// Árbol de navegación docset -> tipos -> entradas, aplanado en una sola
// lista virtualizada (altura de fila uniforme, esqueleto donde faltan
// datos). Teclado completo con aria-activedescendant: el foco es estable
// porque apunta a ids de fila, no a nodos del DOM.
import { useEffect, useMemo, useRef, useState } from "react";
import { BROWSE_PAGE, useBrowse } from "../store/browse";
import { useDocsets } from "../store/docsets";
import { useViewer } from "../store/viewer";
import type { NavEntry } from "../lib/types";

const ROW_H = 30;
const OVERSCAN = 8;

type Row =
  | { type: "doc"; id: string; docsetId: string; name: string; di: number; setsize: number; expanded: boolean }
  | { type: "kinds-loading"; id: string; docsetId: string }
  | { type: "kinds-error"; id: string; docsetId: string; message: string }
  | { type: "kinds-empty"; id: string; docsetId: string }
  | { type: "kind"; id: string; docsetId: string; kind: string; label: string; inferred: boolean; count: number; ki: number; ksize: number; expanded: boolean }
  | { type: "entries-error"; id: string; docsetId: string; kind: string; count: number; message: string }
  | { type: "entry"; id: string; docsetId: string; kind: string; entry: NavEntry; ei: number; esize: number }
  | { type: "skeleton"; id: string; docsetId: string; kind: string; ei: number; esize: number };

function rowId(di: number, ki: number, ei: number): string {
  return `br-${di}-${ki}-${ei}`;
}

export function BrowseTree() {
  const docsets = useDocsets((s) => s.docsets);
  const kinds = useBrowse((s) => s.kinds);
  const kindsState = useBrowse((s) => s.kindsState);
  const kindsError = useBrowse((s) => s.kindsError);
  const entries = useBrowse((s) => s.entries);
  const entriesError = useBrowse((s) => s.entriesError);
  const expandedDocs = useBrowse((s) => s.expandedDocs);
  const expandedKinds = useBrowse((s) => s.expandedKinds);
  const toggleDoc = useBrowse((s) => s.toggleDoc);
  const toggleKind = useBrowse((s) => s.toggleKind);
  const collapseAll = useBrowse((s) => s.collapseAll);
  const ensureRange = useBrowse((s) => s.ensureRange);
  const retryEntries = useBrowse((s) => s.retryEntries);
  const ensureKinds = useBrowse((s) => s.ensureKinds);
  const openDoc = useViewer((s) => s.openDoc);
  const current = useViewer((s) => s.current);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    docsets.forEach((d, di) => {
      const expanded = expandedDocs.includes(d.id);
      out.push({
        type: "doc", id: rowId(di, -1, -1), docsetId: d.id, name: d.name,
        di, setsize: docsets.length, expanded,
      });
      if (!expanded) return;
      const state = kindsState[d.id];
      if (state !== "ready") {
        out.push(
          state === "error"
            ? { type: "kinds-error", id: rowId(di, -2, -1), docsetId: d.id, message: kindsError[d.id] ?? "" }
            : { type: "kinds-loading", id: rowId(di, -2, -1), docsetId: d.id },
        );
        return;
      }
      const ks = kinds[d.id] ?? [];
      if (ks.length === 0) {
        out.push({ type: "kinds-empty", id: rowId(di, -2, -1), docsetId: d.id });
        return;
      }
      const openKinds = expandedKinds[d.id] ?? [];
      ks.forEach((k, ki) => {
        const kExpanded = openKinds.includes(k.kind);
        out.push({
          type: "kind", id: rowId(di, ki, -1), docsetId: d.id, kind: k.kind,
          label: k.label, inferred: k.inferred, count: k.count, ki, ksize: ks.length, expanded: kExpanded,
        });
        if (!kExpanded) return;
        const err = entriesError[`${d.id}\n${k.kind}`];
        if (err) {
          out.push({
            type: "entries-error", id: rowId(di, ki, -2), docsetId: d.id,
            kind: k.kind, count: k.count, message: err,
          });
        }
        const arr = entries[`${d.id}\n${k.kind}`];
        for (let ei = 0; ei < k.count; ei++) {
          const e = arr?.[ei];
          out.push(
            e
              ? { type: "entry", id: rowId(di, ki, ei), docsetId: d.id, kind: k.kind, entry: e, ei, esize: k.count }
              : { type: "skeleton", id: rowId(di, ki, ei), docsetId: d.id, kind: k.kind, ei, esize: k.count },
          );
        }
      });
    });
    return out;
  }, [docsets, expandedDocs, kindsState, kindsError, kinds, expandedKinds, entriesError, entries]);

  // Activo siempre dentro de la lista.
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Pide las páginas visibles (al desplazar o expandirse).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const from = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const to = Math.ceil((scrollTop + el.clientHeight) / ROW_H) + OVERSCAN;
    const ranges = new Map<string, { docsetId: string; kind: string; count: number; from: number; to: number }>();
    for (let i = from; i < Math.min(to, rows.length); i++) {
      const r = rows[i];
      if (r.type !== "entry" && r.type !== "skeleton") continue;
      const key = `${r.docsetId}\n${r.kind}`;
      const prev = ranges.get(key);
      if (prev) {
        prev.from = Math.min(prev.from, r.ei);
        prev.to = Math.max(prev.to, r.ei + 1);
      } else {
        ranges.set(key, { docsetId: r.docsetId, kind: r.kind, count: r.esize, from: r.ei, to: r.ei + 1 });
      }
    }
    for (const r of ranges.values()) {
      void ensureRange(r.docsetId, r.kind, r.count, r.from, r.to);
    }
  }, [scrollTop, rows, ensureRange]);

  const scrollActiveIntoView = (idx: number): void => {
    const el = scrollRef.current;
    if (!el) return;
    const top = idx * ROW_H;
    if (top < el.scrollTop) {
      el.scrollTop = top;
    } else if (top + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + ROW_H - el.clientHeight;
    }
  };

  const activate = (idx: number): void => {
    const r = rows[idx];
    if (!r) return;
    if (r.type === "doc") {
      void openDoc(r.docsetId);
    } else if (r.type === "kind") {
      toggleKind(r.docsetId, r.kind);
    } else if (r.type === "entry") {
      void openDoc(r.docsetId, { name: r.entry.name, path: r.entry.path });
    } else if (r.type === "kinds-error") {
      void ensureKinds(r.docsetId);
    } else if (r.type === "entries-error") {
      const el = scrollRef.current;
      const from = el ? Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN) : 0;
      void retryEntries(r.docsetId, r.kind, r.count, from, from + BROWSE_PAGE * 2);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (rows.length === 0) return;
    const move = (next: number): void => {
      const clamped = Math.max(0, Math.min(rows.length - 1, next));
      setActiveIdx(clamped);
      scrollActiveIntoView(clamped);
    };
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(activeIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(activeIdx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(rows.length - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const r = rows[activeIdx];
      if (r?.type === "doc" && !r.expanded) toggleDoc(r.docsetId);
      else if (r?.type === "kind" && !r.expanded) toggleKind(r.docsetId, r.kind);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const r = rows[activeIdx];
      if (r?.type === "doc" && r.expanded) toggleDoc(r.docsetId);
      else if (r?.type === "kind" && r.expanded) toggleKind(r.docsetId, r.kind);
      else if (r && (r.type === "kind" || r.type === "entry" || r.type === "skeleton" || r.type === "entries-error")) {
        // Sube al padre (docset del tipo, o tipo de la entrada).
        const di = r.type === "kind" ? findDocRow(rows, r.docsetId) : findKindRow(rows, r.docsetId, r.kind);
        if (di >= 0) move(di);
      } else if (r && (r.type === "kinds-loading" || r.type === "kinds-error" || r.type === "kinds-empty")) {
        const di = findDocRow(rows, r.docsetId);
        if (di >= 0) move(di);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(activeIdx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      collapseAll();
      move(0);
    }
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const el = scrollRef.current;
  const viewH = el?.clientHeight ?? 600;
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const activeId = rows[activeIdx]?.id;

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label="Navegación por docsets"
      aria-activedescendant={activeId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      className="relative flex-1 overflow-y-auto outline-none"
    >
      {rows.length === 0 ? (
        <p className="px-2 py-1 text-xs text-gray-500">Sin docsets cargados.</p>
      ) : (
        <div style={{ height: rows.length * ROW_H }} className="relative">
          {rows.slice(start, end).map((r, k) => (
            <RowView
              key={r.id}
              row={r}
              top={(start + k) * ROW_H}
              active={start + k === activeIdx}
              currentDoc={current?.docsetId ?? null}
              onToggleDoc={toggleDoc}
              onToggleKind={toggleKind}
              onActivate={() => activate(start + k)}
              onOpenDoc={(docsetId, entry) => void openDoc(docsetId, entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function findDocRow(rows: Row[], docsetId: string): number {
  return rows.findIndex((r) => r.type === "doc" && r.docsetId === docsetId);
}

function findKindRow(rows: Row[], docsetId: string, kind: string): number {
  return rows.findIndex(
    (r) => r.type === "kind" && r.docsetId === docsetId && r.kind === kind,
  );
}

interface RowViewProps {
  row: Row;
  top: number;
  active: boolean;
  currentDoc: string | null;
  onToggleDoc: (docsetId: string) => void;
  onToggleKind: (docsetId: string, kind: string) => void;
  onActivate: () => void;
  onOpenDoc: (docsetId: string, entry?: { name: string; path: string }) => void;
}

function RowView({ row, top, active, currentDoc, onToggleDoc, onToggleKind, onActivate, onOpenDoc }: RowViewProps) {
  const base: React.CSSProperties = {
    position: "absolute",
    top,
    height: ROW_H,
    left: 0,
    right: 0,
  };
  const hl = active
    ? "bg-gray-200 dark:bg-gray-800"
    : "hover:bg-gray-200 dark:hover:bg-gray-800";
  if (row.type === "doc") {
    return (
      <div
        id={row.id}
        role="treeitem"
        aria-level={1}
        aria-expanded={row.expanded}
        aria-setsize={row.setsize}
        aria-posinset={row.di + 1}
        aria-selected={active}
        style={{ ...base, paddingLeft: 4 }}
        className={`flex items-center gap-1 rounded text-sm ${hl} ${
          currentDoc === row.docsetId ? "font-medium" : ""
        }`}
      >
        <button
          aria-label={row.expanded ? "Contraer" : "Expandir"}
          onClick={() => onToggleDoc(row.docsetId)}
          className="w-5 shrink-0 text-xs text-gray-500"
        >
          {row.expanded ? "▾" : "▸"}
        </button>
        <button
          onClick={() => onOpenDoc(row.docsetId)}
          title={row.name}
          className="flex-1 truncate text-left"
        >
          {row.name}
        </button>
      </div>
    );
  }
  if (row.type === "kinds-loading") {
    return (
      <div id={row.id} style={{ ...base, paddingLeft: 28 }} className="flex items-center text-xs text-gray-500">
        Cargando tipos…
      </div>
    );
  }
  if (row.type === "kinds-error") {
    return (
      <div
        id={row.id}
        role="treeitem"
        aria-level={2}
        style={{ ...base, paddingLeft: 28 }}
        className={`flex items-center gap-2 text-xs text-red-500 ${hl}`}
        onClick={onActivate}
      >
        <span className="truncate">Error al cargar tipos</span>
        <span className="underline">Reintentar</span>
      </div>
    );
  }
  if (row.type === "kinds-empty") {
    return (
      <div id={row.id} style={{ ...base, paddingLeft: 28 }} className="flex items-center text-xs text-gray-500">
        Sin entradas.
      </div>
    );
  }
  if (row.type === "kind") {
    return (
      <div
        id={row.id}
        role="treeitem"
        aria-level={2}
        aria-expanded={row.expanded}
        aria-setsize={row.ksize}
        aria-posinset={row.ki + 1}
        aria-selected={active}
        style={{ ...base, paddingLeft: 22 }}
        className={`flex cursor-pointer items-center gap-1 rounded text-sm ${hl}`}
        onClick={() => onToggleKind(row.docsetId, row.kind)}
      >
        <span className="w-4 shrink-0 text-xs text-gray-500">{row.expanded ? "▾" : "▸"}</span>
        <span className="truncate" title={row.inferred ? `Etiqueta inferida, no oficial en Dash (código: ${row.kind})` : row.label}>
          {row.label}
        </span>
        {row.inferred && (
          <span className="shrink-0 text-xs italic text-gray-400">{row.kind}</span>
        )}
        <span className="shrink-0 text-xs text-gray-400">{row.count}</span>
      </div>
    );
  }
  if (row.type === "entries-error") {
    return (
      <div
        id={row.id}
        role="treeitem"
        aria-level={3}
        style={{ ...base, paddingLeft: 44 }}
        className={`flex cursor-pointer items-center gap-2 text-xs text-red-500 ${hl}`}
        onClick={onActivate}
        title={row.message}
      >
        <span>Error al cargar entradas.</span>
        <span className="underline">Reintentar</span>
      </div>
    );
  }
  if (row.type === "skeleton") {
    return (
      <div
        id={row.id}
        role="treeitem"
        aria-level={3}
        aria-setsize={row.esize}
        aria-posinset={row.ei + 1}
        aria-label="Cargando entrada"
        style={{ ...base, paddingLeft: 44 }}
        className="flex items-center"
      >
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    );
  }
  return (
    <div
      id={row.id}
      role="treeitem"
      aria-level={3}
      aria-setsize={row.esize}
      aria-posinset={row.ei + 1}
      aria-selected={active}
      style={{ ...base, paddingLeft: 44 }}
      className={`flex cursor-pointer items-center rounded text-sm ${hl}`}
      onClick={onActivate}
      title={row.entry.name}
    >
      <span className="truncate">{row.entry.name}</span>
    </div>
  );
}
