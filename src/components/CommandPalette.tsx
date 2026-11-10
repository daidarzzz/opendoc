// Command Palette: Ctrl/Cmd+K, resultados en vivo, teclado completo.
// Filtros por docset (`cpp:vector`): chips con icono dentro del campo,
// fantasma de Tab-completado, aviso con filtro vacío.
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useT } from "../hooks/useT";
import { usePalette } from "../store/palette";
import { useDocsets } from "../store/docsets";
import type { SearchResult } from "../lib/types";
import { filterKeys, ghostFor, tailAfterColon } from "../lib/paletteFilter";
import { DocsetIcon } from "./DocsetIcon";
import { CloseIcon, SearchIcon } from "./Icons";

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
      className={`relative mx-2 cursor-pointer rounded-sm px-3 py-[7px] transition-colors duration-75 ${
        active ? "bg-ink/[0.06] text-ink" : "text-ink-2"
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
      {active && <span aria-hidden className="absolute bottom-[7px] left-0 top-[7px] w-[2px] bg-accent" />}
      <span className="flex min-w-0 items-center gap-3">
        <DocsetIcon icon={icon} name={docName} />
        <span className={`truncate font-mono text-[13px] ${active ? "font-medium" : ""}`}>{result.name}</span>
        <span className="ml-auto flex shrink-0 items-baseline gap-2.5">
          <span className="label text-[9.5px] text-faint">{result.kind}</span>
          <span className="max-w-[10rem] truncate text-[13.5px] italic text-muted">{docName}</span>
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
    pending: searching,
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
  const { t } = useT();
  const mod = platform() === "macos" ? "⌘" : "Ctrl";

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

  // Al moverse con las flechas, la fila activa se mantiene visible.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`palette-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, results]);

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
      className="backdrop z-50 pt-[14vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.dialog")}
        className="surface w-full max-w-[40rem] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {(applied.length > 0 || unknown.length > 0) && (
          <div
            role="group"
            aria-label={t("palette.filters")}
            className="flex flex-wrap gap-1.5 px-5 pt-3.5"
          >
            {applied.map((f) => {
              const meta = docMeta.get(f.docset_id);
              const name = meta?.name ?? f.docset_id;
              return (
                <button
                  key={f.docset_id}
                  onClick={() => removeFilter(f.token)}
                  aria-label={t("palette.removeFilter", { name })}
                  title={t("palette.removeFilterTitle", { name })}
                  className="flex animate-fade-in items-center gap-1.5 rounded-sm border border-accent-text/25 bg-accent/10 py-0.5 pl-1.5 pr-1 font-mono text-[11px] font-medium text-accent-text transition-colors hover:bg-accent/20"
                >
                  <DocsetIcon icon={meta?.icon ?? null} name={name} size={12} />
                  <span>{name}</span>
                  {!f.installed && <span>{t("palette.notInstalled")}</span>}
                  <CloseIcon size={11} strokeWidth={2} className="opacity-70" />
                </button>
              );
            })}
            {unknown.map((u) => (
              <button
                key={`unknown:${u}`}
                onClick={() => removeFilter(u)}
                aria-label={t("palette.unknownFilter", { name: u })}
                title={t("palette.unknownTitle")}
                className="rounded-sm border border-rule px-2 py-0.5 font-mono text-[11px] text-faint line-through"
              >
                {t("palette.unknownSuffix", { name: u })}
              </button>
            ))}
          </div>
        )}
        <div className="relative border-b border-rule">
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted"
          />
          <div
            aria-hidden
            className="pointer-events-none select-none overflow-hidden whitespace-pre py-4 pl-[3.25rem] pr-5 text-[19px] text-ink"
          >
            {query === "" ? (
              <span className="italic text-faint">{t("palette.ghost")}</span>
            ) : (
              <>
                <span>{query}</span>
                {ghost !== null && <span className="text-faint">{ghost}</span>}
              </>
            )}
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={onKey}
            placeholder=""
            aria-label={t("palette.input")}
            aria-expanded={results.length > 0}
            aria-activedescendant={
              results.length > 0 ? `palette-option-${activeIndex}` : undefined
            }
            role="combobox"
            aria-autocomplete="list"
            className="absolute inset-0 w-full border-0 bg-transparent py-4 pl-[3.25rem] pr-5 text-[19px] text-transparent caret-accent-text outline-none selection:bg-accent/30 focus-visible:shadow-none"
          />
        </div>
        {query.trim() === "" ? (
          <p className="px-5 py-4 text-[14.5px] italic text-muted">
            {t("palette.emptyHint")}
          </p>
        ) : noticeMode ? (
          <p className="px-5 py-4 text-[14.5px] italic text-muted">
            {t("palette.searchingIn", { names: noticeNames.join(", ") })}
          </p>
        ) : results.length === 0 ? (
          // Mientras busca no se anuncia "sin resultados" (solo al terminar):
          // la línea se reserva invisible para que la caja no cambie de alto.
          <p
            aria-hidden={searching}
            className={`px-5 py-4 text-[14.5px] italic text-muted ${searching ? "invisible" : ""}`}
          >
            {t("palette.noResults")}
          </p>
        ) : (
          <ul role="listbox" className="max-h-[26rem] overflow-y-auto py-2">
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule bg-paper/60 px-5 py-2 font-mono text-[10.5px] text-faint">
          <span className="flex items-center gap-1.5"><kbd className="kbd min-w-0 text-[10px]">↑</kbd><kbd className="kbd min-w-0 text-[10px]">↓</kbd>{t("palette.hintNavigate")}</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd min-w-0 text-[10px]">↵</kbd>{t("palette.hintOpen")}</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd min-w-0 text-[10px]">{mod} ↵</kbd>{t("palette.hintNewTab")}</span>
          <span className="ml-auto flex items-center gap-1.5"><kbd className="kbd min-w-0 text-[10px]">esc</kbd>{t("palette.hintClose")}</span>
        </div>
      </div>
    </div>
  );
}
