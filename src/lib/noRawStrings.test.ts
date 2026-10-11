// Guardia: ningún texto visible en español fuera de `i18n.ts`.
// Revisa los literales de cadena y el texto JSX de `src/` (sin comentarios
// ni tests): si aparece una tilde/diéresis, un gerundio español o una
// palabra de la lista, el test falla con archivo y línea. Al añadir texto
// visible, ponlo en `i18n.ts` (en + es).
import { describe, expect, it } from "vitest";

const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Ficheros con texto traducible permitido (el diccionario y sus tests). */
function relevant(path: string): boolean {
  if (path.endsWith(".test.ts")) return false;
  if (path.endsWith("/i18n.ts")) return false;
  return true;
}

const DIACRITICS = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/;
/** Gerundios (-ando/-iendo): morfología inequívocamente española. */
const GERUND = /\b\w*(ando|iendo|ándo|iéndo)\b/;
/** Palabras españolas sin tilde que no tienen uso en inglés. */
const WORDS = [
  "reintentar",
  "guardar",
  "instalar",
  "instalado",
  "instalada",
  "desinstalar",
  "actualizar",
  "todos",
  "todas",
  "carpeta",
  "buscar",
  "cerrar",
  "abrir",
  "elegir",
  "idioma",
  "ajustes",
  "entradas",
  "entrada",
  "resultado",
  "resultados",
  "quitar",
  "volver",
  "empezar",
  "aceptar",
  "cancelar",
  "confirmar",
  "anterior",
  "siguiente",
  "cargado",
  "cargada",
  "cargados",
  "mostrar",
  "ocultar",
  "filtro",
  "filtros",
  "estado",
  "lista",
  "nuevo",
  "nueva",
  "otro",
  "otra",
  "nombre",
  "mensaje",
  "ventana",
  "teclado",
  "boton",
  "botones",
  "pantalla",
  "modo",
  "texto",
  "ayuda",
  "enlace",
  "salir",
  "listo",
  "mismo",
  "cada",
  "sobre",
  "entre",
  "porque",
  "aqui",
  "este",
  "esta",
  "estos",
  "estas",
  "tiene",
  "tienen",
  "hacer",
  "puede",
  "desde",
  "hasta",
  "hacia",
  "donde",
  "como",
  "pero",
  "para",
  "por",
  "con",
  "sin",
  "del",
  "los",
  "las",
  "una",
  "son",
  "hay",
  "muy",
];
const WORD_RE = new RegExp(`\\b(${WORDS.join("|")})\\b`, "i");

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Trocea el fuente en trozos de código o literal (los comentarios se
 *  descartan). Sin lexer de plantillas completo: basta para detectar
 *  literales olvidados. Los literales regex se saltan como bloque. */
function chunks(source: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  let quote: string | null = null;
  const push = (): void => {
    if (buf !== "") out.push(buf);
    buf = "";
  };
  // ¿Puede empezar un regex aquí? Heurística: tras estos tokens nunca va
  // una división (en este código no se divide nada en el frontend).
  const regexAllowed = (): boolean => {
    const prev = buf.replace(/\s+$/, "").slice(-1);
    return prev === "" || "=(:,[!&|?{};".includes(prev);
  };
  while (i < source.length) {
    const c = source[i] ?? "";
    const next = source[i + 1] ?? "";
    if (quote !== null) {
      buf += c;
      if (c === "\\") {
        buf += next;
        i += 2;
        continue;
      }
      if (c === quote) {
        quote = null;
        push();
      }
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      push();
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      push();
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === "/" && regexAllowed()) {
      // Literal regex: se salta entero (clases `[...]` incluidas).
      push();
      i += 1;
      let inClass = false;
      while (i < source.length) {
        const r = source[i] ?? "";
        if (r === "\\") {
          i += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        else if (r === "\n") break;
        i += 1;
      }
      i += 1;
      while (i < source.length && /[a-z]/.test(source[i] ?? "")) i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      push();
      quote = c;
      buf += c;
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  push();
  return out;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const [path, source] of Object.entries(SOURCES)) {
    if (!relevant(path)) continue;
    let cursor = 0;
    for (const text of chunks(source)) {
      const at = source.indexOf(text, cursor);
      cursor = at < 0 ? cursor + text.length : at + text.length;
      if (!DIACRITICS.test(text) && !GERUND.test(text) && !WORD_RE.test(text)) continue;
      const line = source.slice(0, Math.max(0, at)).split("\n").length;
      hits.push({ file: path, line, text: text.trim().slice(0, 80) });
    }
  }
  return hits;
}

describe("sin literales en español fuera de i18n.ts", () => {
  it("no hay texto visible sin traducir", () => {
    const hits = scan();
    expect(
      hits.map((h) => `${h.file}:${h.line}: ${h.text}`),
      "mueve estos textos a i18n.ts (en + es)",
    ).toEqual([]);
  });
});
