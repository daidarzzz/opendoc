// Command Palette: Ctrl/Cmd+K, resultados en vivo, teclado completo.
import { useEffect, useRef } from "react";
import { usePalette } from "../store/palette";

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
            {results.map((r, i) => (
              <li
                key={`${r.docset_id}:${r.name}:${i}`}
                id={`palette-option-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`cursor-pointer px-4 py-1.5 text-sm ${
                  i === activeIndex
                    ? "bg-blue-100 dark:bg-blue-900"
                    : ""
                }`}
                onMouseEnter={() =>
                  usePalette.setState({ activeIndex: i })
                }
                onClick={chooseActive}
              >
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {r.kind} · {r.docset_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
