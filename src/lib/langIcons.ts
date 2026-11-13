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

/** Claves candidatas de un nombre o id (`Python 3` → `python_3`, `python`).
 *  Los ids de DevDocs (`devdocs-python~3.12`) se reducen a su base. */
export function iconKeys(raw: string): string[] {
  let k = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (k.startsWith("devdocs-")) k = k.slice("devdocs-".length).split("~")[0] ?? "";
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
  "apple", "bash", "cobol", "coffeescript", "crystal", "denojs", "django", "emacs", "express", "flask",
  "gradle", "handlebars", "influxdb", "latex", "linux", "mariadb", "markdown", "nextjs", "rust",
  "socketio", "sqlalchemy", "stylus", "symfony", "threejs",
]);

/** Icono empaquetado con su URL y si necesita invertirse en tema oscuro. */
export function langIcon(...names: (string | null | undefined)[]): { url: string; dark: boolean } | null {
  const icon = resolveLangIcon(...names);
  const url = icon ? FILES[`../assets/devicons/${icon}.svg`] : undefined;
  return icon && url ? { url, dark: DARK_ICONS.has(icon) } : null;
}

/** Lenguajes y herramientas sin icono en Devicon: insignia propia con las
 *  iniciales y un color de marca (mejor que el monograma automático). */
const BADGES: Record<string, { text: string; color: string }> = {
  d: { text: "D", color: "#b03931" },
  odin: { text: "Od", color: "#3882d2" },
  pony: { text: "Po", color: "#7d3c98" },
  typst: { text: "Ty", color: "#239dad" },
  "tcl/tk": { text: "Tcl", color: "#a0522d" },
  tcllib: { text: "Tcl", color: "#a0522d" },
  octave: { text: "Oc", color: "#0790c0" },
  nushell: { text: "Nu", color: "#4e9a06" },
  fish: { text: "Fi", color: "#2d8a9a" },
  liquid: { text: "Lq", color: "#2b6cb0" },
  twig: { text: "Tw", color: "#6a9a1f" },
  jinja: { text: "Ji", color: "#b41717" },
  gnu_make: { text: "Mk", color: "#6d4c41" },
  gnuplot: { text: "Gp", color: "#c2410c" },
  graphviz: { text: "Gv", color: "#1d6fa5" },
  gtk: { text: "Gtk", color: "#4a86cf" },
  i3: { text: "i3", color: "#3a3a3a" },
  jq: { text: "jq", color: "#2f4858" },
  http: { text: "HT", color: "#475569" },
  svg: { text: "SVG", color: "#e8a317" },
  q: { text: "Q", color: "#a34a28" },
  // Librerías y herramientas sin icono en Devicon.
  async: { text: "As", color: "#e91e63" },
  bluebird: { text: "Bb", color: "#2b6a9e" },
  bottle: { text: "Bo", color: "#3b6ea5" },
  celery: { text: "Ce", color: "#37814a" },
  chai: { text: "Ch", color: "#a1503f" },
  chef: { text: "Cf", color: "#f09820" },
  codeceptjs: { text: "Cj", color: "#2d7d9a" },
  codeception: { text: "Cc", color: "#2c8a5b" },
  coldfusion: { text: "CF", color: "#0a63a8" },
  cordova: { text: "Co", color: "#35434b" },
  "cycle.js": { text: "Cy", color: "#2f6fa5" },
  dojo: { text: "Dj", color: "#cc3a28" },
  eigen3: { text: "Ei", color: "#5a6b7b" },
  enzyme: { text: "En", color: "#1f8a70" },
  falcon: { text: "Fa", color: "#2a5a8a" },
  flow: { text: "Fl", color: "#d6a017" },
  fluture: { text: "Fu", color: "#4d6a8f" },
  graphite: { text: "Gr", color: "#2a6f4e" },
  haproxy: { text: "HA", color: "#106da9" },
  hammerspoon: { text: "Hs", color: "#c0392b" },
  hapi: { text: "Hp", color: "#f7931e" },
  "immutable.js": { text: "Im", color: "#d1344f" },
  jsdoc: { text: "JD", color: "#3b6fb6" },
  joi: { text: "Jo", color: "#e27a3f" },
  koa: { text: "Ko", color: "#2a2a2a" },
  leaflet: { text: "Le", color: "#199900" },
  lit: { text: "Li", color: "#324fff" },
  "maplibre_gl_js": { text: "ML", color: "#396cb2" },
  "marionette.js": { text: "Ma", color: "#d0762a" },
  modernizr: { text: "Mo", color: "#d6247b" },
  "moment.js": { text: "Mj", color: "#4a90a8" },
  "moment.js_timezone": { text: "Mz", color: "#4a90a8" },
  nokogiri: { text: "No", color: "#b0252a" },
  openlayers: { text: "OL", color: "#1f6b75" },
  opentsdb: { text: "Ot", color: "#3b8eea" },
  opentofu: { text: "Tf", color: "#f5a623" },
  padrino: { text: "Pa", color: "#a52a2a" },
  phaser: { text: "Ph", color: "#6c5ce7" },
  pointcloudlibrary: { text: "PCL", color: "#3a7ca5" },
  polars: { text: "Pl", color: "#1c6dd0" },
  prettier: { text: "Pr", color: "#c188c1" },
  pygame: { text: "Pg", color: "#3a8a3a" },
  qunit: { text: "QU", color: "#9c3493" },
  ramda: { text: "Ra", color: "#d12c40" },
  relay: { text: "Re", color: "#f26b00" },
  requests: { text: "Rq", color: "#2f6fa5" },
  requirejs: { text: "Rj", color: "#2d6a9f" },
  rethinkdb: { text: "Rt", color: "#2b7b94" },
  saltstack: { text: "Sa", color: "#00aeef" },
  sanctuary: { text: "Sn", color: "#7a4a9a" },
  sanctuary_def: { text: "Sd", color: "#7a4a9a" },
  sanctuary_type_classes: { text: "St", color: "#7a4a9a" },
  "sinon.js": { text: "Si", color: "#7a4aa0" },
  statsmodels: { text: "Sm", color: "#2a6a9a" },
  support_tables: { text: "ST", color: "#5a6a7a" },
  tanstack_query: { text: "TQ", color: "#e8590c" },
  tanstack_router: { text: "TR", color: "#2a8a5a" },
  tokio: { text: "To", color: "#4a5a6a" },
  trio: { text: "Tr", color: "#6a4a9a" },
  "underscore.js": { text: "Us", color: "#0a5a8a" },
  valibot: { text: "Va", color: "#2a6af0" },
  varnish: { text: "Vn", color: "#2f6f8f" },
  wagtail: { text: "Wa", color: "#1f6f6a" },
  werkzeug: { text: "We", color: "#5a6a7a" },
  click: { text: "Cl", color: "#2a7a5a" },
  "date-fns": { text: "df", color: "#6a4a8a" },
  "es-toolkit": { text: "ES", color: "#f0a000" },
  esbuild: { text: "eb", color: "#c9a400" },
  "scikit-image": { text: "Sk", color: "#e8742a" },
};

/** Insignia propia de un lenguaje sin Devicon (`null` si no hay). */
export function badge(...names: (string | null | undefined)[]): { text: string; color: string } | null {
  for (const name of names) {
    if (!name) continue;
    for (const key of iconKeys(name)) {
      const hit = BADGES[key];
      if (hit) return hit;
    }
  }
  return null;
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
