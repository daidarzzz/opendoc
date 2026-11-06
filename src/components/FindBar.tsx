// Barra de búsqueda en la página (Ctrl/Cmd+F), flotante arriba a la
// derecha del visor. Intro / Mayús+Intro recorren, Esc cierra.
import { useEffect, useRef } from "react";
import { useT } from "../hooks/useT";
import { useFind } from "../store/find";
import { ChevronIcon, CloseIcon, SearchIcon } from "./Icons";

export function FindBar() {
  const open = useFind((s) => s.open);
  const query = useFind((s) => s.query);
  const total = useFind((s) => s.total);
  const current = useFind((s) => s.current);
  const answered = useFind((s) => s.answered);
  const focusSeq = useFind((s) => s.focusSeq);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, focusSeq]);

  if (!open) return null;

  const none = query !== "" && answered && total === 0;
  const btn =
    "flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white";

  return (
    <div
      role="search"
      aria-label={t("find.label")}
      className="absolute right-4 top-3 z-20 flex animate-pop-in items-center gap-1 rounded-xl border border-gray-200/80 bg-white/95 py-1 pl-2.5 pr-1 shadow-float backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/95"
    >
      <SearchIcon size={14} className={none ? "text-red-500" : "text-gray-400"} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => useFind.getState().setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            useFind.getState().step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            useFind.getState().close();
          }
        }}
        placeholder={t("find.placeholder")}
        aria-label={t("find.placeholder")}
        spellCheck={false}
        className={`w-48 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-gray-400 focus-visible:shadow-none dark:placeholder:text-gray-500 ${
          none ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"
        }`}
      />
      <span
        aria-live="polite"
        className={`min-w-[4.5rem] shrink-0 px-1 text-right text-xs tabular-nums ${none ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}
      >
        {query === "" || !answered ? "" : total === 0 ? t("find.none") : t("find.count", { current, total })}
      </span>
      <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-white/10" />
      <button type="button" aria-label={t("find.prev")} title={t("find.prev")} disabled={total === 0} onClick={() => useFind.getState().step(-1)} className={btn}>
        <ChevronIcon direction="left" size={14} strokeWidth={2.5} className="rotate-90" />
      </button>
      <button type="button" aria-label={t("find.next")} title={t("find.next")} disabled={total === 0} onClick={() => useFind.getState().step(1)} className={btn}>
        <ChevronIcon direction="down" size={14} strokeWidth={2.5} />
      </button>
      <button type="button" aria-label={t("find.close")} title={t("find.close")} onClick={() => useFind.getState().close()} className={btn}>
        <CloseIcon size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}
