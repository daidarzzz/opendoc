// Índice de la página: los mensajes del iframe son contenido no fiable.
import { describe, expect, it } from "vitest";
import { MAX_TOC_ITEMS, MAX_TOC_TEXT, validateTocActiveMessage, validateTocMessage } from "./iframeMessages";

describe("validateTocMessage", () => {
  it("acepta una lista válida y limpia el texto", () => {
    const res = validateTocMessage(
      { type: "opendoc-toc", items: [{ text: "  json —\n  JSON  ", level: 1 }, { text: "Basic usage", level: 2 }] },
      true,
    );
    expect(res).toEqual([
      { text: "json — JSON", level: 1 },
      { text: "Basic usage", level: 2 },
    ]);
  });

  it("acepta la lista vacía", () => {
    expect(validateTocMessage({ type: "opendoc-toc", items: [] }, true)).toEqual([]);
  });

  it("rechaza fuentes no fiables, tipos, niveles y tamaños fuera de rango", () => {
    const ok = { type: "opendoc-toc", items: [{ text: "a", level: 2 }] };
    expect(validateTocMessage(ok, false)).toBeNull();
    expect(validateTocMessage({ ...ok, type: "otro" }, true)).toBeNull();
    expect(validateTocMessage({ type: "opendoc-toc", items: [{ text: "a", level: 5 }] }, true)).toBeNull();
    expect(validateTocMessage({ type: "opendoc-toc", items: [{ text: "   ", level: 1 }] }, true)).toBeNull();
    expect(validateTocMessage({ type: "opendoc-toc", items: [{ text: 3, level: 1 }] }, true)).toBeNull();
    expect(validateTocMessage({ type: "opendoc-toc", items: "x" }, true)).toBeNull();
    const many = Array.from({ length: MAX_TOC_ITEMS + 1 }, () => ({ text: "a", level: 2 }));
    expect(validateTocMessage({ type: "opendoc-toc", items: many }, true)).toBeNull();
  });

  it("recorta textos largos", () => {
    const res = validateTocMessage({ type: "opendoc-toc", items: [{ text: "x".repeat(500), level: 3 }] }, true);
    expect(res?.[0]?.text).toHaveLength(MAX_TOC_TEXT);
  });
});

describe("validateTocActiveMessage", () => {
  it("acepta índices enteros en rango", () => {
    expect(validateTocActiveMessage({ type: "opendoc-toc-active", index: 0 }, true)).toBe(0);
    expect(validateTocActiveMessage({ type: "opendoc-toc-active", index: 12 }, true)).toBe(12);
  });

  it("rechaza el resto", () => {
    expect(validateTocActiveMessage({ type: "opendoc-toc-active", index: 1 }, false)).toBeNull();
    expect(validateTocActiveMessage({ type: "opendoc-toc-active", index: -1 }, true)).toBeNull();
    expect(validateTocActiveMessage({ type: "opendoc-toc-active", index: 1.5 }, true)).toBeNull();
    expect(validateTocActiveMessage({ type: "opendoc-toc-active", index: MAX_TOC_ITEMS }, true)).toBeNull();
  });
});
