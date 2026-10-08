// Command Palette: Ctrl/Cmd+K, resultados en vivo, teclado completo.
// Filtros por docset (`cpp:vector`): chips con icono dentro del campo,
// fantasma de Tab-completado, aviso con filtro vacío.
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { usePalette } from "../store/palette";
import { useDocsets } from "../store/docsets";
import type { SearchResult } from "../lib/types";
import { filterKeys, ghostFor, tailAfterColon } from "../lib/paletteFilter";
import { DocsetIcon } from "./DocsetIcon";

// Fila memoizada: el icono se resuelve por docset_id desde un mapa (las
// data-URL largas no se repiten en el estado de la paleta).
const PaletteRow = memo(function PaletteRow({
  result,
  index,
  active,
  icon,
  docName,
  onHover,
  onChoose,
}: {
  result: SearchResult;
  index: number;
  active: boolean;
  icon: string | null;
  docName: string;
  onHover: (index: number) => void;
  onChoose: (opts?: { newTab?: boolean }) => void;
}) {
  return (
    <li
      id={`palette-option-${index}`}
      role="option"
      aria-selected={active}
      className={`cursor-pointer px-4 py-1.5 text-sm ${
        active ? "bg-blue-100 dark:bg-blue-900" : ""
      }`}
      onMouseEnter={() => onHover(index)}
      onClick={() => onChoose()}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onChoose({ newTab: true });
        }
      }}
    >
      <span className="flex items-center gap-2">
        <DocsetIcon icon={icon} name={docName} />
        <span className="font-medium">{result.name}</span>
        <span className="ml-2 text-xs text-gray-500">
          {result.kind} · {docName}
        </span>
      </span>
    </li>
  );
});

export function CommandPalette() {
  const {
    open,
    query,
    results,
    applied,
    unknown,
    activeIndex,
    setOpen,
    setQuery,
    moveActive,
    chooseActive,
    removeFilter,
    removeLastFilter,
  } = usePalette();
  const inputRef = useRef<HTMLInputElement>(null);
  const docsets = useDocsets((s) => s.docsets);
  const pending = useDocsets((s) => s.pending);

  // Mapa id -> (icono, nombre): una sola copia de cada data-URL (incluye
  // pendientes para los chips "(sin instalar)").
  const docMeta = useMemo(() => {
    const map = new Map<string, { icon: string | null; name: string }>();
    for (const d of docsets) {
      map.set(d.id, { icon: d.icon, name: d.name });
    }
    for (const p of pending) {
      if (!map.has(p.id)) map.set(p.id, { icon: p.icon, name: p.name });
    }
    return map;
  }, [docsets, pending]);

  const keys = useMemo(
    () => filterKeys(docsets, pending),
    [docsets, pending],
  );
  const ghost = useMemo(() => ghostFor(query, keys), [query, keys]);

  const hover = useCallback((index: number) => {
    usePalette.setState({ activeIndex: index });
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open ]);

  if (!open) return null;

  const completion = ghost !== null ? query + ghost : null;

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseActive({ newTab: e.ctrlKey || e.metaKey });
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      // Solo con finalización única: si no, Tab conserva su
      // comportamiento normal (no se atrapa el foco).
      if (completion !== null) {
        e.preventDefault();
        setQuery(completion);
      }
    } else if (
      e.key === "Backspace" &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      // Al inicio del campo: quita el último filtro (`cpp,py:x` → `cpp:x`).
      removeLastFilter();
    }
  }

  const tail = tailAfterColon(query);
  const noticeMode = tail !== null && tail.trim() === "" && applied.length > 0;
  const noticeNames = applied.map((f) => docMeta.get(f.docset_id)?.name ?? f.docset_id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en la documentación"
        className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {(applied.length > 0 || unknown.length > 0) && (
          <div
            role="group"
            aria-label="Filtros de docsets"
            className="flex flex-wrap gap-1 px-4 pt-2"
          >
            {applied.map((f) => {
              const meta = docMeta.get(f.docset_id);
              const name = meta?.name ?? f.docset_id;
              return (
                <button
                  key={f.docset_id}
                  onClick={() => removeFilter(f.token)}
                  aria-label={`Filtro: ${name}, quitar`}
                  title={`Filtro: ${name} (clic para quitar)`}
                  className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-900 dark:bg-blue-900 dark:text-blue-100"
                >
                  <DocsetIcon icon={meta?.icon ?? null} name={name} size={12} />
                  <span>{name}</span>
                  {!f.installed && <span>(sin instalar)</span>}
                  <span aria-hidden>×</span>
                </button>
              );
            })}
            {unknown.map((u) => (
              <button
                key={`unknown:${u}`}
                onClick={() => removeFilter(u)}
                aria-label={`Filtro desconocido: ${u}, quitar`}
                title="No coincide con ningún docset (clic para quitar)"
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400 line-through dark:bg-gray-800"
              >
                {u} · no encontrado
              </button>
            ))}
          </div>
        )}
        <div className="relative border-b border-gray-200 dark:border-gray-700">
          <div
            aria-hidden
            className="pointer-events-none select-none overflow-hidden whitespace-pre px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
          >
            {query === "" ? (
              <span className="text-gray-400">Buscar… (Esc para cerrar)</span>
            ) : (
              <>
                <span>{query}</span>
                {ghost !== null && <span className="text-gray-400">{ghost}</span>}
              </>
            )}
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={onKey}
            placeholder=""
            aria-label="Buscar en la documentación"
            aria-expanded={results.length > 0}
            aria-activedescendant={
              results.length > 0 ? `palette-option-${activeIndex}` : undefined
            }
            role="combobox"
            aria-autocomplete="list"
            className="absolute inset-0 w-full bg-transparent px-4 py-3 text-sm text-transparent outline-none caret-gray-900 selection:bg-blue-300/60 dark:caret-gray-100 dark:selection:bg-blue-500/50"
          />
        </div>
        {query.trim() === "" ? (
          <p className="px-4 py-3 text-xs text-gray-500">
            Escribe para buscar en los docsets cargados.
          </p>
        ) : noticeMode ? (
          <p className="px-4 py-3 text-xs text-gray-500">
            Buscando en {noticeNames.join(", ")}…
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-500">Sin resultados.</p>
        ) : (
          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {results.map((r, i) => {
              const meta = docMeta.get(r.docset_id);
              return (
                <PaletteRow
                  key={`${r.docset_id}:${r.name}:${i}`}
                  result={r}
                  index={i}
                  active={i === activeIndex}
                  icon={meta?.icon ?? null}
                  docName={meta?.name ?? r.docset_id}
                  onHover={hover}
                  onChoose={chooseActive}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
