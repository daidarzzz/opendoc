// Estilos: lectura tolerante y contraste del texto del acento sobre las
// superficies de cada estilo (tarjeta y lienzo), en los 4 acentos y 2 modos.
import { describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_HEX, contrastRatio } from "./accent";
import { CARD_HEX, DEFAULT_DESIGN, DESIGNS, canvasHex, normalizeDesign } from "./design";

describe("estilos", () => {
  it("hay 3 estilos con Color por defecto", () => {
    expect([...DESIGNS]).toEqual(["color", "paper", "classic"]);
    expect(DEFAULT_DESIGN).toBe("color");
  });

  it("valores desconocidos caen al estilo por defecto", () => {
    expect(normalizeDesign("paper")).toBe("paper");
    expect(normalizeDesign("Paper")).toBe("color");
    expect(normalizeDesign(undefined)).toBe("color");
    expect(normalizeDesign(3)).toBe("color");
  });

  it("texto del acento >= 4.5:1 sobre tarjeta y lienzo de cada estilo", () => {
    for (const design of DESIGNS) {
      for (const accent of ACCENTS) {
        for (const mode of ["light", "dark"] as const) {
          const text = ACCENT_HEX[accent][mode].text;
          for (const bg of [CARD_HEX[design][mode], canvasHex(design, accent, mode)]) {
            const ratio = contrastRatio(text, bg);
            expect(ratio, `${design}/${accent}/${mode}: ${text} sobre ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
});
