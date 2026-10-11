import { describe, expect, it } from "vitest";
import { errorKindOf, errorTitle, toAppError } from "./appError";

describe("toAppError", () => {
  it("vacío → null", () => {
    expect(toAppError(null)).toBeNull();
    expect(toAppError(undefined)).toBeNull();
    expect(toAppError("")).toBeNull();
  });

  it("ApiError → kind + datos + detalle", () => {
    expect(toAppError({ kind: "no_feed_repo" })).toEqual({
      kind: "no_feed_repo",
      params: {},
      detail: "",
    });
    expect(toAppError({ kind: "download_failed", id: "X", message: "HTTP 404" })).toEqual({
      kind: "download_failed",
      params: { id: "X", message: "HTTP 404" },
      detail: "id=X message=HTTP 404",
    });
    expect(
      toAppError({ kind: "ambiguous_match", id: "X", candidates: ["a", "b"] }),
    ).toEqual({
      kind: "ambiguous_match",
      params: { id: "X", candidates: "a, b" },
      detail: "id=X candidates=a, b",
    });
  });

  it("desconocido → kind unknown sin perder el detalle", () => {
    expect(toAppError(new Error("boom"))).toEqual({ kind: "unknown", params: {}, detail: "boom" });
    expect(toAppError({ raro: 1 })).toEqual({ kind: "unknown", params: {}, detail: '{"raro":1}' });
  });
});

describe("errorKindOf", () => {
  it("extrae kind o cadena vacía", () => {
    expect(errorKindOf({ kind: "no_docsets_dir" })).toBe("no_docsets_dir");
    expect(errorKindOf(new Error("x"))).toBe("");
    expect(errorKindOf(null)).toBe("");
  });
});

describe("errorTitle", () => {
  it("cada kind en ambos idiomas, con sus datos sin traducir", () => {
    const err = {
      kind: "download_failed",
      params: { id: "X", message: "HTTP 404" },
      detail: "id=X message=HTTP 404",
    };
    expect(errorTitle("en", err)).toContain("HTTP 404");
    expect(errorTitle("en", err)).toContain("Download failed");
    expect(errorTitle("es", err)).toContain("Descarga fallida");
    expect(errorTitle("es", err)).toContain("HTTP 404");
    expect(errorTitle("en", { kind: "no_docsets_dir", params: {}, detail: "" })).toContain(
      "choose one",
    );
    expect(
      errorTitle("en", { kind: "no_docsets_dir", params: { path: "C:/x" }, detail: "path=C:/x" }),
    ).toContain("C:/x");
    expect(
      errorTitle("es", { kind: "already_installed", params: { id: "X" }, detail: "id=X" }),
    ).toContain("instalado");
  });

  it("desconocido → genérico traducido", () => {
    const unknown = { kind: "unknown", params: {}, detail: "boom" };
    expect(errorTitle("en", unknown)).toBe("Unexpected error");
    expect(errorTitle("es", unknown)).toBe("Error inesperado");
    expect(errorTitle("en", { kind: "raro_nuevo", params: {}, detail: "" })).toBe(
      "Unexpected error",
    );
  });
});
