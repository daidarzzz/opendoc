// Acento de color de la interfaz (red/blue/amber/catppuccin, rojo por defecto).
// - Única fuente de verdad: tonos hex por acento y modo, normalización
//   tolerante (`normalizeAccent`) y contraste WCAG (`contrastRatio`).
// - El CSS (`index.css`, `[data-accent="..."]`) y `tailwind.config.js`
//   consumen estos mismos valores: si un tono cambia aquí, debe cambiar
//   allí también (lo vigila `accent.test.ts`).
// - Roles: `accent` (marca: logo y decoración), `text` (texto e
//   indicadores funcionales: contrasta >= 4.5:1 sobre el fondo en los dos
//   modos), `solid` (relleno de botones primarios) + `on` (texto sobre
//   `solid`, >= 4.5:1). El ámbar de marca no contrasta sobre blanco, así
//   que sus usos funcionales van oscurecidos; la marca se mantiene en el
//   logo. Los errores usan rojos fijos propios, independientes del acento.
// - Catppuccin: solo se usan dos valores de su paleta (Latte Mauve
//   #8839EF en claro, Mocha Mauve #CBA6F7 en oscuro).
//   Copyright (c) 2021 Catppuccin Org, licencia MIT.
import type { Accent } from "./types";

/** Acento por defecto (ausente o inválido -> rojo). */
export const DEFAULT_ACCENT: Accent = "red";

/** Los 4 acentos, en el orden del selector de Ajustes. */
export const ACCENTS: readonly Accent[] = ["red", "blue", "amber", "catppuccin"];

/** Los 4 tonos de un acento en un modo (hex `#rrggbb`). */
export interface AccentTones {
  accent: string;
  text: string;
  solid: string;
  on: string;
}

export const ACCENT_HEX: Record<Accent, { light: AccentTones; dark: AccentTones }> = {
  red: {
    light: { accent: "#DE3830", text: "#C62828", solid: "#C62828", on: "#FFFFFF" },
    dark: { accent: "#DE3830", text: "#FF8A80", solid: "#C62828", on: "#FFFFFF" },
  },
  blue: {
    light: { accent: "#0071BC", text: "#0071BC", solid: "#0071BC", on: "#FFFFFF" },
    dark: { accent: "#0071BC", text: "#4FA3E3", solid: "#0071BC", on: "#FFFFFF" },
  },
  amber: {
    light: { accent: "#FBB03B", text: "#B45309", solid: "#FBB03B", on: "#1F2937" },
    dark: { accent: "#FBB03B", text: "#FBB03B", solid: "#FBB03B", on: "#1F2937" },
  },
  catppuccin: {
    light: { accent: "#8839EF", text: "#8839EF", solid: "#8839EF", on: "#FFFFFF" },
    dark: { accent: "#CBA6F7", text: "#CBA6F7", solid: "#CBA6F7", on: "#111827" },
  },
};

/** Fondo de la app por modo (de `App.tsx`: `bg-white` / `dark:bg-gray-900`). */
export const APP_BG: { light: string; dark: string } = {
  light: "#FFFFFF",
  dark: "#111827",
};

/** Cualquier valor desconocido cae al rojo (lectura tolerante por campo). */
export function normalizeAccent(value: unknown): Accent {
  return (ACCENTS as readonly unknown[]).includes(value)
    ? (value as Accent)
    : DEFAULT_ACCENT;
}

/** Canales `"R G B"` de un hex para las variables CSS (`rgb(var(--x) / <alpha>)`). */
export function hexToChannels(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m?.[1]) return "0 0 0";
  const n = Number.parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Aplica el acento al documento (cambio en caliente, sin reiniciar). */
export function applyAccent(accent: Accent): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = accent;
}

// Sin parpadeo: el rojo es el valor por defecto del CSS, se fija al importar
// (igual que el inglés en `i18n.ts`); `init()` del store lo corrige.
applyAccent(DEFAULT_ACCENT);

/** Luminancia relativa WCAG 2.1 de un hex `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  const n = m?.[1] ? Number.parseInt(m[1], 16) : 0;
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255)
  );
}

/** Contraste WCAG 2.1 entre dos hex (`1`..`21`). */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const a = relativeLuminance(fgHex);
  const b = relativeLuminance(bgHex);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
