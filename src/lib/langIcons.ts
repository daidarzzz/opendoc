// Iconos de lenguajes/tecnologías empaquetados con la app (Devicon, MIT;
// ver `scripts/gen-devicons.mjs`). Sirven sin red para entradas del
// catálogo no instaladas y para docsets sin icono propio. Solo se usan
// nombres de la tabla verificada `langIcons.json`.
import table from "./langIcons.json";

const MAP = table as Record<string, string>;

const FILES = import.meta.glob("../assets/devicons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Claves candidatas de un nombre o id (`Python 3` → `python_3`, `python`). */
export function iconKeys(raw: string): string[] {
  const k = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (k === "") return [];
  const out: string[] = [k];
  const noParen = k.replace(/\(.*?\)/g, "").replace(/_+$/, "");
  // Sufijo de versión: `_3`, `_5.4`, `_se17`, `_v2`.
  const noVersion = (s: string): string => s.replace(/_(v?\d[\w.]*|se\d*)$/, "");
  for (const c of [noParen, noVersion(k), noVersion(noParen)]) if (c !== "") out.push(c);
  const first = k.split("_")[0];
  if (first) out.push(first);
  return [...new Set(out)];
}

/** Nombre Devicon para el primer candidato que esté en la tabla. */
export function resolveLangIcon(...names: (string | null | undefined)[]): string | null {
  for (const name of names) {
    if (!name) continue;
    for (const key of iconKeys(name)) {
      const hit = MAP[key];
      if (hit) return hit;
    }
  }
  return null;
}

/** URL del SVG empaquetado (o `null` si no hay). */
export function langIconUrl(...names: (string | null | undefined)[]): string | null {
  return langIcon(...names)?.url ?? null;
}

/** Iconos casi negros: en tema oscuro se invierten (conservando el tono). */
const DARK_ICONS = new Set([
  "apple", "bash", "coffeescript", "django", "emacs", "express", "flask", "gradle", "handlebars",
  "latex", "linux", "markdown", "rust", "sqlalchemy", "stylus", "symfony",
]);

/** Icono empaquetado con su URL y si necesita invertirse en tema oscuro. */
export function langIcon(...names: (string | null | undefined)[]): { url: string; dark: boolean } | null {
  const icon = resolveLangIcon(...names);
  const url = icon ? FILES[`../assets/devicons/${icon}.svg`] : undefined;
  return icon && url ? { url, dark: DARK_ICONS.has(icon) } : null;
}

const MONOGRAM_COLORS = [
  "#ef4444", "#f97316", "#d97706", "#16a34a", "#0d9488", "#0891b2",
  "#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#db2777", "#475569",
];

/** Iniciales y color estable para el icono de reserva. */
export function monogram(name: string): { text: string; color: string } {
  const words = name
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = words[0] ?? "?";
  const text =
    words.length > 1 && words[1] && /^\p{L}/u.test(words[1])
      ? (a.charAt(0) + words[1].charAt(0)).toUpperCase()
      : a.charAt(0).toUpperCase() + a.slice(1, 2).toLowerCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return { text, color: MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length] ?? "#475569" };
}
