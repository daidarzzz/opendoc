// Estilo visual de la interfaz (solo frontend, se guarda en `prefs`).
// Todos comparten la misma estructura (lienzo + tarjeta, pestañas
// conectadas, glifos de tipo); cambian colores, tipografía y forma:
// - `color`: lienzo teñido por el acento, Bricolage + Inter (por defecto).
// - `paper`: papel y tinta sin tinte, Newsreader + IBM Plex Mono, esquinas casi rectas.
// - `classic`: grises neutros e Inter, cercano al OpenDoc original.
// El CSS (`index.css`, `[data-design="..."]`) usa estos mismos tonos de
// superficie; `design.test.ts` vigila el contraste del texto del acento.
import { CANVAS_HEX } from "./accent";
import type { Accent } from "./types";

export type Design = "color" | "paper" | "classic" | "liquid-glass";

export const HAS_MAC_GLASS = typeof window !== "undefined" &&
  (window as Window & { __OPENDOC_MAC_GLASS__?: boolean }).__OPENDOC_MAC_GLASS__ === true;

// En macOS 26 la barra de título va superpuesta en todos los estilos: el
// documento lo sabe para dejar hueco a los semáforos (ver `index.css`).
// En pantalla completa no hay semáforos: `data-fullscreen` suelta el hueco.
if (HAS_MAC_GLASS && typeof document !== "undefined") {
  const root = document.documentElement;
  root.dataset.macWindow = "";
  const syncFullscreen = () => {
    const full = window.innerWidth >= screen.width && window.innerHeight >= screen.height;
    if (full) root.dataset.fullscreen = "";
    else delete root.dataset.fullscreen;
  };
  syncFullscreen();
  window.addEventListener("resize", syncFullscreen);
}

export const DESIGNS: readonly Design[] = HAS_MAC_GLASS
  ? ["liquid-glass", "color", "paper", "classic"]
  : ["color", "paper", "classic"];

export const DEFAULT_DESIGN: Design = HAS_MAC_GLASS ? "liquid-glass" : "color";

/** Cualquier valor desconocido cae al estilo por defecto. */
export function normalizeDesign(value: unknown): Design {
  return (DESIGNS as readonly unknown[]).includes(value) ? (value as Design) : DEFAULT_DESIGN;
}

/** Aplica el estilo al documento (cambio en caliente, sin reiniciar). */
export function applyDesign(design: Design): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.design = design;
}

type Mode = "light" | "dark";

/** Tarjeta (contenido) por estilo y modo. */
export const CARD_HEX: Record<Design, Record<Mode, string>> = {
  "liquid-glass": { light: "#FFFFFF", dark: "#16171B" },
  color: { light: "#FFFFFF", dark: "#18181C" },
  paper: { light: "#F5F1E8", dark: "#15140F" },
  classic: { light: "#FFFFFF", dark: "#16171B" },
};

/** Lienzo (barra lateral y pestañas) por estilo, acento y modo. */
export function canvasHex(design: Design, accent: Accent, mode: Mode): string {
  if (design === "paper") return mode === "light" ? "#ECE6D9" : "#0F0E0B";
  if (design === "classic" || design === "liquid-glass") return mode === "light" ? "#F1F1F3" : "#0E0F12";
  return CANVAS_HEX[accent][mode];
}
