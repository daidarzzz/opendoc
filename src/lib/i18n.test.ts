import { describe, expect, it } from "vitest";
import {
  applyDocumentLang,
  en,
  es,
  formatCount,
  formatDateTime,
  normalizeLanguage,
  t,
  tn,
  LANGUAGE_NAMES,
} from "./i18n";

describe("diccionarios", () => {
  it("en y es tienen exactamente las mismas claves", () => {
    const enKeys = Object.keys(en).sort();
    const esKeys = Object.keys(es).sort();
    expect(esKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(50);
  });

  it("ningún valor es vacío y no hay llaves sin cerrar", () => {
    for (const [key, value] of Object.entries({ ...en, ...es })) {
      expect(value, key).not.toBe("");
      expect((value.match(/{/g) ?? []).length, key).toBe(
        (value.match(/}/g) ?? []).length,
      );
    }
  });

  it("cada idioma escrito en su propio idioma", () => {
    expect(LANGUAGE_NAMES).toEqual({ en: "English", es: "Español" });
  });
});

describe("t/tn", () => {
  it("interpola y elige idioma", () => {
    expect(t("en", "tabs.closeTab", { title: "X" })).toBe("Close tab X");
    expect(t("es", "tabs.closeTab", { title: "X" })).toBe("Cerrar pestaña X");
  });

  it("plural sencillo", () => {
    expect(tn("en", 1, "welcome.docCountOne", "welcome.docCountMany", { n: 1 })).toBe(
      "1 docset loaded",
    );
    expect(tn("en", 2, "welcome.docCountOne", "welcome.docCountMany", { n: 2 })).toBe(
      "2 docsets loaded",
    );
    expect(tn("es", 1, "welcome.docCountOne", "welcome.docCountMany", { n: 1 })).toBe(
      "1 docset cargado",
    );
  });

  it("los números se formatean con Intl", () => {
    expect(t("en", "welcome.docCountMany", { n: 12345 })).toContain("12,345");
    expect(t("es", "welcome.docCountMany", { n: 12345 })).toContain("12.345");
  });
});

describe("normalizeLanguage", () => {
  it("idioma inválido o ausente cae a inglés", () => {
    expect(normalizeLanguage("es")).toBe("es");
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("fr")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
    expect(normalizeLanguage(42)).toBe("en");
    expect(normalizeLanguage("ES")).toBe("en");
  });
});

describe("formatCount/formatDateTime", () => {
  it("miles según idioma", () => {
    expect(formatCount("en", 1234567)).toBe("1,234,567");
    expect(formatCount("es", 1234567)).toBe("1.234.567");
    expect(formatCount("en", Number.NaN)).toBe("0");
  });

  it("nunca sin fecha, fecha legible con fecha", () => {
    expect(formatDateTime("en", null)).toBe("never");
    expect(formatDateTime("es", null)).toBe("nunca");
    expect(formatDateTime("en", Number.NaN)).toBe("never");
    const text = formatDateTime("en", 1_700_000_000);
    expect(text).not.toBe("never");
    expect(text).toContain("2023");
  });
});

describe("applyDocumentLang", () => {
  it("no falla sin DOM y actualiza el lang con DOM", () => {
    expect(() => applyDocumentLang("es")).not.toThrow();
    if (typeof document !== "undefined") {
      applyDocumentLang("es");
      expect(document.documentElement.lang).toBe("es");
      applyDocumentLang("en");
      expect(document.documentElement.lang).toBe("en");
    }
  });
});
