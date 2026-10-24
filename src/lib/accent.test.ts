// Contraste y tabla de acentos: ningún par texto/fondo baja de 4.5:1
// (texto) y ningún par de botón baja de 4.5:1 (texto sobre relleno),
// en los 4 acentos y los 2 modos. Si un tono se ajusta en `accent.ts`,
// este test dice si sigue cumpliendo.
import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  ACCENT_HEX,
  APP_BG,
  DEFAULT_ACCENT,
  contrastRatio,
  hexToChannels,
  normalizeAccent,
} from "./accent";

describe("tabla de acentos", () => {
  it("hay 4 acentos con rojo por defecto", () => {
    expect([...ACCENTS]).toEqual(["red", "blue", "amber", "catppuccin"]);
    expect(DEFAULT_ACCENT).toBe("red");
  });

  it("los tonos fijan los colores de marca acordados", () => {
    expect(ACCENT_HEX.red.light.accent).toBe("#DE3830");
    expect(ACCENT_HEX.blue.light.accent).toBe("#0071BC");
    expect(ACCENT_HEX.amber.light.accent).toBe("#FBB03B");
    expect(ACCENT_HEX.catppuccin.light.accent).toBe("#8839EF");
    expect(ACCENT_HEX.catppuccin.dark.accent).toBe("#CBA6F7");
  });

  it("texto >= 4.5:1 sobre el fondo de la app en cada acento y modo", () => {
    for (const accent of ACCENTS) {
      for (const mode of ["light", "dark"] as const) {
        const tones = ACCENT_HEX[accent][mode];
        const ratio = contrastRatio(tones.text, APP_BG[mode]);
        expect(
          ratio,
          `${accent}/${mode}: text ${tones.text} sobre ${APP_BG[mode]} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("texto sobre relleno sólido >= 4.5:1 en cada acento y modo", () => {
    for (const accent of ACCENTS) {
      for (const mode of ["light", "dark"] as const) {
        const tones = ACCENT_HEX[accent][mode];
        const ratio = contrastRatio(tones.on, tones.solid);
        expect(
          ratio,
          `${accent}/${mode}: on ${tones.on} sobre solid ${tones.solid} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("canales RGB derivan del hex", () => {
    expect(hexToChannels("#DE3830")).toBe("222 56 48");
    expect(hexToChannels("#0071BC")).toBe("0 113 188");
    expect(hexToChannels("#FBB03B")).toBe("251 176 59");
    expect(hexToChannels("#8839EF")).toBe("136 57 239");
    expect(hexToChannels("#CBA6F7")).toBe("203 166 247");
  });
});

describe("lectura tolerante del acento", () => {
  it("ausente o inválido -> rojo", () => {
    expect(normalizeAccent(undefined)).toBe("red");
    expect(normalizeAccent(null)).toBe("red");
    expect(normalizeAccent("morado")).toBe("red");
    expect(normalizeAccent(42)).toBe("red");
    expect(normalizeAccent("Red")).toBe("red");
  });

  it("los 4 valores viajan intactos", () => {
    for (const accent of ACCENTS) {
      expect(normalizeAccent(accent)).toBe(accent);
    }
  });
});
