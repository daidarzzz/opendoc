// Glifo de tipo: familia por tipo de Dash (y abreviaturas) y letra.
import { describe, expect, it } from "vitest";
import { FAMILY_CLASSES, kindFamily, kindLetter } from "./kindGlyph";

describe("kindFamily", () => {
  it("agrupa los tipos habituales de Dash", () => {
    expect(kindFamily("Class")).toBe("type");
    expect(kindFamily("Struct")).toBe("type");
    expect(kindFamily("Function")).toBe("callable");
    expect(kindFamily("Method")).toBe("callable");
    expect(kindFamily("Property")).toBe("member");
    expect(kindFamily("Module")).toBe("module");
    expect(kindFamily("Constant")).toBe("constant");
    expect(kindFamily("Guide")).toBe("doc");
    expect(kindFamily("Section")).toBe("doc");
  });

  it("entiende abreviaturas de los índices Core Data", () => {
    expect(kindFamily("func")).toBe("callable");
    expect(kindFamily("instm")).toBe("callable");
    expect(kindFamily("cl")).toBe("type");
    expect(kindFamily("instp")).toBe("member");
  });

  it("es tolerante con mayúsculas, espacios y vacíos", () => {
    expect(kindFamily("  FUNCTION ")).toBe("callable");
    expect(kindFamily("")).toBe("doc");
    expect(kindFamily("ClassMethod")).toBe("type");
  });

  it("toda familia tiene clases de color", () => {
    for (const k of ["type", "callable", "member", "module", "constant", "doc"] as const) {
      expect(FAMILY_CLASSES[k]).toMatch(/bg-/);
    }
  });
});

describe("kindLetter", () => {
  it("usa la inicial en mayúscula", () => {
    expect(kindLetter("function")).toBe("F");
    expect(kindLetter("Class")).toBe("C");
    expect(kindLetter(" ")).toBe("?");
  });
});
