// Mensajes de las acciones del visor: menú contextual, búsqueda y zoom.
import { describe, expect, it } from "vitest";
import {
  MAX_FIND_MATCHES,
  MAX_SELECTION_LEN,
  matchViewerShortcut,
  validateContextMessage,
  validateFindResultMessage,
  validateKeyMessage,
} from "./iframeMessages";

const IDS = ["css", "py"];
const key = (over: Partial<{ key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }>) => ({
  key: "",
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

describe("validateContextMessage", () => {
  it("acepta forma válida y normaliza el enlace", () => {
    expect(
      validateContextMessage(
        { type: "opendoc-context", x: 10, y: 20, selection: "hola", link: "http://opendoc.localhost/css/a.html#x" },
        true,
        IDS,
      ),
    ).toEqual({ x: 10, y: 20, selection: "hola", link: "opendoc://css/a.html#x" });
  });

  it("descarta enlaces externos o de docsets no cargados sin anular el menú", () => {
    for (const link of ["https://evil.example/", "opendoc://otro/a.html", 42, ""]) {
      expect(validateContextMessage({ type: "opendoc-context", x: 1, y: 1, link }, true, IDS)?.link).toBeNull();
    }
  });

  it("limpia y acota la selección", () => {
    const res = validateContextMessage(
      { type: "opendoc-context", x: 0, y: 0, selection: "a\u0000b\tc\nd".padEnd(MAX_SELECTION_LEN + 50, "z") },
      true,
      IDS,
    );
    expect(res?.selection.startsWith("ab\tc\nd")).toBe(true);
    expect(res?.selection.length).toBeLessThanOrEqual(MAX_SELECTION_LEN);
    expect(validateContextMessage({ type: "opendoc-context", x: 0, y: 0, selection: {} }, true, IDS)?.selection).toBe("");
  });

  it("rechaza fuente no fiable y coordenadas rotas", () => {
    expect(validateContextMessage({ type: "opendoc-context", x: 1, y: 1 }, false, IDS)).toBeNull();
    for (const bad of [
      { type: "opendoc-context", x: "1", y: 1 },
      { type: "opendoc-context", x: 1, y: Number.NaN },
      { type: "opendoc-context", x: 1e9, y: 1 },
      { type: "opendoc-nav", x: 1, y: 1 },
      null,
    ]) {
      expect(validateContextMessage(bad, true, IDS)).toBeNull();
    }
  });
});

describe("validateFindResultMessage", () => {
  it("acepta resultados coherentes", () => {
    expect(validateFindResultMessage({ type: "opendoc-find-result", total: 12, current: 3 }, true)).toEqual({ total: 12, current: 3 });
    expect(validateFindResultMessage({ type: "opendoc-find-result", total: 0, current: 0 }, true)).toEqual({ total: 0, current: 0 });
  });

  it("rechaza valores incoherentes o fuera de rango", () => {
    for (const bad of [
      { total: 3, current: 4 },
      { total: 3, current: 0 },
      { total: -1, current: 0 },
      { total: MAX_FIND_MATCHES + 1, current: 1 },
      { total: 1.5, current: 1 },
      { total: "2", current: 1 },
    ]) {
      expect(validateFindResultMessage({ type: "opendoc-find-result", ...bad }, true), JSON.stringify(bad)).toBeNull();
    }
    expect(validateFindResultMessage({ type: "opendoc-find-result", total: 1, current: 1 }, false)).toBeNull();
  });
});

describe("teclas del visor", () => {
  it("el iframe puede reenviar buscar y zoom", () => {
    for (const k of ["f", "find-close", "zoom-in", "zoom-out", "zoom-reset"]) {
      expect(validateKeyMessage({ type: "opendoc-key", key: k }, true)?.key).toBe(k);
    }
    expect(validateKeyMessage({ type: "opendoc-key", key: "zoom" }, true)).toBeNull();
  });

  it("matchViewerShortcut reconoce Ctrl/Cmd+F y zoom", () => {
    expect(matchViewerShortcut(key({ key: "f", code: "KeyF", ctrlKey: true }))).toBe("find");
    expect(matchViewerShortcut(key({ key: "f", code: "KeyF", metaKey: true }))).toBe("find");
    expect(matchViewerShortcut(key({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true }))).toBe("zoom-in");
    expect(matchViewerShortcut(key({ key: "=", code: "Equal", ctrlKey: true }))).toBe("zoom-in");
    expect(matchViewerShortcut(key({ key: "-", code: "Minus", ctrlKey: true }))).toBe("zoom-out");
    expect(matchViewerShortcut(key({ key: "0", code: "Digit0", ctrlKey: true }))).toBe("zoom-reset");
  });

  it("matchViewerShortcut ignora sin modificador o con Alt", () => {
    expect(matchViewerShortcut(key({ key: "f", code: "KeyF" }))).toBeNull();
    expect(matchViewerShortcut(key({ key: "f", code: "KeyF", ctrlKey: true, altKey: true }))).toBeNull();
    expect(matchViewerShortcut(key({ key: "1", code: "Digit1", ctrlKey: true }))).toBeNull();
  });
});
