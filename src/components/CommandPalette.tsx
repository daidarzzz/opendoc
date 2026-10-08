// Command Palette: Ctrl/Cmd+K, resultados en vivo, teclado completo.
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { usePalette } from "../store/palette";
import { useDocsets } from "../store/docsets";
import type { SearchResult } from "../lib/types";
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
  onChoose: () => void;
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
      onClick={onChoose}
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
    activeIndex,
    setOpen,
    setQuery,
    moveActive,
    chooseActive,
  } = usePalette();
  const inputRef = useRef<HTMLInputElement>(null);
  const docsets = useDocsets((s) => s.docsets);

  // Mapa id -> (icono, nombre): una sola copia de cada data-URL.
  const docMeta = useMemo(() => {
    const map = new Map<string, { icon: string | null; name: string }>();
    for (const d of docsets) {
      map.set(d.id, { icon: d.icon, name: d.name });
    }
    return map;
  }, [docsets]);

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

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseActive();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

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
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKey}
          placeholder="Buscar… (Esc para cerrar)"
          aria-label="Buscar en la documentación"
          aria-expanded={results.length > 0}
          aria-activedescendant={
            results.length > 0 ? `palette-option-${activeIndex}` : undefined
          }
          role="combobox"
          aria-autocomplete="list"
          className="w-full border-b border-gray-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-gray-700"
        />
        {query.trim() === "" ? (
          <p className="px-4 py-3 text-xs text-gray-500">
            Escribe para buscar en los docsets cargados.
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
