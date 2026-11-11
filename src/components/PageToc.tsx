// Índice de la página: una guía de rayitas al borde derecho del visor (una
// por encabezado, más larga cuanto más alto el nivel; la actual en el
// color del acento). Al pasar el ratón o enfocarla se despliega la lista
// para saltar. Opcional (Ajustes → Lectura) y solo con 3+ encabezados.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../hooks/useT";
import type { TocItem } from "../lib/iframeMessages";

/** Máximo de rayitas: con más encabezados se quedan los niveles altos. */
const MAX_TICKS = 32;
const TICK_W: Record<number, number> = { 1: 18, 2: 13, 3: 9, 4: 6 };
/** Margen antes de cerrar la lista al salir el ratón (da tiempo a elegir). */
const CLOSE_DELAY_MS = 450;

/** Encabezados representados en la guía (índices del original). */
function ticksFor(items: TocItem[]): number[] {
  for (let max = 4; max >= 1; max--) {
    const idx = items.flatMap((it, i) => (it.level <= max ? [i] : []));
    if (idx.length <= MAX_TICKS || max === 1) return idx.slice(0, MAX_TICKS);
  }
  return [];
}

export const PageToc = memo(function PageToc({
  items,
  active,
  onGo,
}: {
  items: TocItem[];
  active: number;
  onGo: (index: number) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const cancelClose = (): void => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = (): void => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = (): void => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);
  const ticks = useMemo(() => ticksFor(items), [items]);
  const minLevel = useMemo(() => Math.min(...items.map((i) => i.level)), [items]);
  // Rayita «actual»: la última representada que no pasa del activo.
  const activeTick = useMemo(() => {
    let cur = ticks[0] ?? 0;
    for (const i of ticks) if (i <= active) cur = i;
    return cur;
  }, [ticks, active]);

  if (items.length < 3) return null;

  return (
    <nav
      aria-label={t("toc.rail")}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideSoon();
      }}
      className="group/toc absolute right-3 top-1/2 z-10 flex -translate-y-1/2 animate-fade-in items-center"
    >
      {/* Lista desplegable (hover / foco), a la izquierda de la guía. Un
          puente invisible (pr-3) la une a la guía para no perder el hover. */}
      <div
        className={`absolute right-full top-1/2 w-72 -translate-y-1/2 pr-2 transition-all duration-200 ease-smooth ${
          open ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-2 opacity-0"
        }`}
      >
        <div className="max-h-[min(70vh,34rem)] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-pop">
          <p className="label px-2.5 pb-1.5 pt-1.5">{t("toc.label")}</p>
          <ul>
            {items.map((it, i) => {
              const on = i === active;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      onGo(i);
                      hideSoon();
                    }}
                    title={it.text}
                    style={{ paddingLeft: 10 + (it.level - minLevel) * 12 }}
                    className={`relative flex w-full items-center rounded-lg py-1 pr-2.5 text-left transition-colors duration-100 ${
                      on ? "bg-accent/[0.09] font-semibold text-accent-text" : "text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
                    } ${it.level === minLevel ? "text-[13px]" : "text-[12.5px]"}`}
                  >
                    {on && <span aria-hidden className="absolute bottom-1.5 left-1 top-1.5 w-[2px] rounded-full bg-accent" />}
                    <span className="truncate">{it.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* La guía: rayitas alineadas a la derecha. */}
      <div aria-hidden className={`flex flex-col items-end gap-[7px] rounded-lg px-1.5 py-2 transition-colors duration-200 ${open ? "bg-card/80" : ""}`}>
        {ticks.map((i) => {
          const on = i === activeTick;
          return (
            <span
              key={i}
              className={`block h-[2px] rounded-full transition-all duration-300 ease-smooth ${
                on ? "bg-accent" : open ? "bg-ink/30" : "bg-ink/20"
              }`}
              style={{ width: (TICK_W[items[i]?.level ?? 4] ?? 6) + (on ? 4 : 0) }}
            />
          );
        })}
      </div>
    </nav>
  );
});
