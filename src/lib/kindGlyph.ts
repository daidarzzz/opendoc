// Glifo de tipo de símbolo (lógica pura, testeada con Vitest): una letra
// sobre un cuadrado de color según la familia del tipo de Dash. Ayuda a
// distinguir de un vistazo clases, funciones, propiedades o módulos en la
// paleta y el árbol. Tipos desconocidos caen en la familia "doc".

/** Familia visual de un tipo de entrada. */
export type KindFamily = "type" | "callable" | "member" | "module" | "constant" | "doc";

const FAMILIES: Record<Exclude<KindFamily, "doc">, readonly string[]> = {
  type: [
    "class", "struct", "type", "interface", "protocol", "trait", "enum", "union",
    "record", "object", "category", "typedef", "alias", "mixin", "exception", "error",
  ],
  callable: [
    "function", "method", "constructor", "procedure", "subroutine", "macro",
    "operator", "hook", "filter", "command", "callback", "delegate", "event", "builtin",
  ],
  member: [
    "property", "field", "variable", "attribute", "parameter", "option", "setting",
    "element", "member", "instance", "global", "binding", "notation",
  ],
  module: [
    "module", "namespace", "package", "library", "framework", "plugin", "service",
    "resource", "extension", "file", "component",
  ],
  constant: ["constant", "value", "keyword", "literal", "define", "word", "tag", "directive"],
};

/** Familia de un tipo (`"Class"`, `"func"`, `"instm"`…), sin distinguir mayúsculas. */
export function kindFamily(kind: string): KindFamily {
  const k = kind.trim().toLowerCase();
  if (k === "") return "doc";
  // Abreviaturas habituales de los índices de Dash (Core Data / Apple).
  const ABBR: Record<string, KindFamily> = {
    func: "callable", clm: "callable", instm: "callable", intfm: "callable",
    cl: "type", tdef: "type", intf: "type",
    instp: "member", intfp: "member", var: "member",
    const: "constant",
  };
  const abbr = ABBR[k];
  if (abbr) return abbr;
  for (const [family, words] of Object.entries(FAMILIES) as [Exclude<KindFamily, "doc">, readonly string[]][]) {
    if (words.includes(k)) return family;
  }
  for (const [family, words] of Object.entries(FAMILIES) as [Exclude<KindFamily, "doc">, readonly string[]][]) {
    if (words.some((w) => k.startsWith(w) || k.endsWith(w))) return family;
  }
  return "doc";
}

/** Letra del glifo: inicial del tipo en mayúscula (`?` si no hay). */
export function kindLetter(kind: string): string {
  const ch = kind.trim().charAt(0);
  return ch === "" ? "?" : ch.toUpperCase();
}

/** Clases de color por familia (relleno sólido + letra con contraste). */
export const FAMILY_CLASSES: Record<KindFamily, string> = {
  type: "bg-amber-400 text-amber-950",
  callable: "bg-violet-500 text-white",
  member: "bg-sky-500 text-white",
  module: "bg-emerald-500 text-white",
  constant: "bg-rose-500 text-white",
  doc: "bg-zinc-400 text-white dark:bg-zinc-600",
};
