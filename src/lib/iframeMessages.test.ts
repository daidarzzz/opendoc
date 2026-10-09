import { describe, expect, it } from "vitest";
import {
  isValidNavUrl,
  keyRateAllow,
  matchParentShortcut,
  OPEN_TAB_RATE_MAX,
  OPEN_TAB_RATE_WINDOW_MS,
  rateAllow,
  sanitizeScrollY,
  sanitizeTitle,
  toBackendUrl,
  validateKeyMessage,
  validateNavMessage,
  validateNavigateMessage,
  validateOpenTabMessage,
  validatePrefetchMessage,
  validateReadyMessage,
  validateScrollMessage,
} from "./iframeMessages";

const DOCSETS = ["css", "python-3"];

describe("toBackendUrl", () => {
  it("acepta opendoc:// y la forma Windows", () => {
    expect(toBackendUrl("opendoc://css/a.html#x")).toBe("opendoc://css/a.html#x");
    expect(toBackendUrl("http://opendoc.localhost/css/a.html")).toBe("opendoc://css/a.html");
  });

  it("rechaza otros esquemas y hosts", () => {
    expect(toBackendUrl("https://example.com/x")).toBeNull();
    expect(toBackendUrl("http://localhost/css/a.html")).toBeNull();
    expect(toBackendUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("isValidNavUrl", () => {
  it("exige docset cargado y longitud", () => {
    expect(isValidNavUrl("opendoc://css/a.html", DOCSETS)).toBe(true);
    expect(isValidNavUrl("opendoc://css/a.html#f", DOCSETS)).toBe(true);
    expect(isValidNavUrl("opendoc://nope/a.html", DOCSETS)).toBe(false);
    expect(isValidNavUrl("opendoc://", DOCSETS)).toBe(false);
    expect(isValidNavUrl("opendoc:///a.html", DOCSETS)).toBe(false);
    expect(isValidNavUrl(`opendoc://css/${"a".repeat(5000)}`, DOCSETS)).toBe(false);
  });
});

describe("sanitizeTitle", () => {
  it("texto ≤200 sin controles; vacío → null", () => {
    expect(sanitizeTitle("grid - CSS")).toBe("grid - CSS");
    expect(sanitizeTitle("  ")).toBeNull();
    expect(sanitizeTitle(42)).toBeNull();
    expect(sanitizeTitle(null)).toBeNull();
    expect(sanitizeTitle("a\u0000b\u001Bc")).toBe("abc");
    expect(sanitizeTitle("x".repeat(500))).toHaveLength(200);
  });
});

describe("sanitizeScrollY", () => {
  it("solo finitos en rango", () => {
    expect(sanitizeScrollY(120)).toBe(120);
    expect(sanitizeScrollY(0)).toBe(0);
    expect(sanitizeScrollY(-1)).toBeNull();
    expect(sanitizeScrollY(Number.NaN)).toBeNull();
    expect(sanitizeScrollY(Number.POSITIVE_INFINITY)).toBeNull();
    expect(sanitizeScrollY("120")).toBeNull();
    expect(sanitizeScrollY(20_000_000)).toBeNull();
  });
});

describe("validateNavMessage", () => {
  const good = { type: "opendoc-nav", url: "opendoc://css/a.html", title: "A" };

  it("acepta el mensaje sano de fuente confiable", () => {
    expect(validateNavMessage(good, true, DOCSETS)).toEqual({ url: "opendoc://css/a.html", title: "A" });
  });

  it("sin título conserva (null) sin fallar", () => {
    expect(validateNavMessage({ type: "opendoc-nav", url: "opendoc://css/a.html" }, true, DOCSETS)).toEqual({
      url: "opendoc://css/a.html",
      title: null,
    });
  });

  it("rechaza fuente falsificada aunque el formato sea válido", () => {
    expect(validateNavMessage(good, false, DOCSETS)).toBeNull();
  });

  it("rechaza malformados y URLs ajenas", () => {
    for (const bad of [
      null,
      "opendoc-nav",
      42,
      { type: "opendoc-theme", value: "dark" },
      { type: "opendoc-nav" },
      { type: "opendoc-nav", url: 42 },
      { type: "opendoc-nav", url: "https://evil.com/x" },
      { type: "opendoc-nav", url: "opendoc://otro/a.html" },
      { type: "opendoc-nav", url: "opendoc://css/a.html", title: "x".repeat(500) },
    ]) {
      const res = validateNavMessage(bad, true, DOCSETS);
      if (typeof bad === "object" && bad !== null && (bad as Record<string, unknown>)["title"] === "x".repeat(500)) {
        // Título largo se recorta, no se rechaza.
        expect(res?.title).toHaveLength(200);
      } else {
        expect(res, JSON.stringify(bad)).toBeNull();
      }
    }
  });
});

describe("validateNavigateMessage", () => {
  it("acepta solo solicitudes de navegación internas", () => {
    expect(validateNavigateMessage({ type: "opendoc-navigate", url: "opendoc://css/a.html" }, true, DOCSETS))
      .toEqual({ url: "opendoc://css/a.html", title: null });
    expect(validateNavigateMessage({ type: "opendoc-nav", url: "opendoc://css/a.html" }, true, DOCSETS))
      .toBeNull();
    expect(validateNavigateMessage({ type: "opendoc-navigate", url: "opendoc://other/a.html" }, true, DOCSETS))
      .toBeNull();
  });
});

describe("validatePrefetchMessage", () => {
  it("solo acepta URLs internas de docsets cargados desde el iframe activo", () => {
    expect(validatePrefetchMessage({ type: "opendoc-prefetch", url: "opendoc://css/a.html" }, true, DOCSETS))
      .toEqual({ url: "opendoc://css/a.html" });
    expect(validatePrefetchMessage({ type: "opendoc-prefetch", url: "https://example.com" }, true, DOCSETS))
      .toBeNull();
    expect(validatePrefetchMessage({ type: "opendoc-prefetch", url: "opendoc://missing/a.html" }, true, DOCSETS))
      .toBeNull();
    expect(validatePrefetchMessage({ type: "opendoc-prefetch", url: "opendoc://css/a.html" }, false, DOCSETS))
      .toBeNull();
  });
});

describe("validateReadyMessage", () => {
  it("valida que la URL de primera pintura pertenece a un docset cargado", () => {
    expect(validateReadyMessage({ type: "opendoc-ready", url: "opendoc://css/a.html" }, true, DOCSETS))
      .toEqual({ url: "opendoc://css/a.html", title: null });
    expect(validateReadyMessage({ type: "opendoc-ready", url: "opendoc://missing/a.html" }, true, DOCSETS))
      .toBeNull();
    expect(validateReadyMessage({ type: "opendoc-nav", url: "opendoc://css/a.html" }, true, DOCSETS))
      .toBeNull();
  });
});

describe("validateOpenTabMessage", () => {
  const open = { type: "opendoc-open-tab", url: "opendoc://css/a.html#frag" };

  it("acepta enlaces internos validados", () => {
    expect(validateOpenTabMessage(open, true, DOCSETS)).toEqual({
      url: "opendoc://css/a.html#frag",
      title: null,
    });
  });

  it("rechaza fuente falsificada, externos y rotos", () => {
    expect(validateOpenTabMessage(open, false, DOCSETS)).toBeNull();
    expect(
      validateOpenTabMessage({ type: "opendoc-open-tab", url: "https://evil.com/x" }, true, DOCSETS),
    ).toBeNull();
    expect(
      validateOpenTabMessage({ type: "opendoc-open-tab", url: "opendoc://otro/a.html" }, true, DOCSETS),
    ).toBeNull();
    expect(validateOpenTabMessage({ type: "opendoc-open-tab" }, true, DOCSETS)).toBeNull();
    expect(validateOpenTabMessage({ type: "opendoc-nav", url: "opendoc://css/a.html" }, true, DOCSETS)).toBeNull();
  });
});

describe("rateAllow", () => {
  it("3/s para abrir pestañas desde el documento", () => {
    let times: number[] = [];
    for (let i = 0; i < OPEN_TAB_RATE_MAX; i++) {
      const r = rateAllow(times, i * 100, OPEN_TAB_RATE_MAX, OPEN_TAB_RATE_WINDOW_MS);
      expect(r.allowed).toBe(true);
      times = r.times;
    }
    expect(rateAllow(times, 400, OPEN_TAB_RATE_MAX, OPEN_TAB_RATE_WINDOW_MS).allowed).toBe(false);
  });
});

describe("validateScrollMessage", () => {
  it("acepta y rechaza según forma y rango", () => {
    expect(validateScrollMessage({ type: "opendoc-scroll", y: 50 }, true)).toEqual({ y: 50 });
    expect(validateScrollMessage({ type: "opendoc-scroll", y: 50 }, false)).toBeNull();
    expect(validateScrollMessage({ type: "opendoc-scroll", y: -5 }, true)).toBeNull();
    expect(validateScrollMessage({ type: "opendoc-scroll" }, true)).toBeNull();
    expect(validateScrollMessage({ type: "opendoc-nav", url: "opendoc://css/a.html" }, true)).toBeNull();
  });
});

describe("validateKeyMessage", () => {
  it("solo teclas reenviables con forma exacta", () => {
    expect(validateKeyMessage({ type: "opendoc-key", key: "w", shift: false }, true)).toEqual({
      key: "w",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "tab", shift: true }, true)).toEqual({
      key: "tab",
      shift: true,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "t", shift: false }, true)).toEqual({
      key: "t",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "k", shift: false }, true)).toEqual({
      key: "k",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "5", shift: 1 }, true)).toEqual({
      key: "5",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "alt-left" }, true)).toEqual({
      key: "alt-left",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "mouse-back" }, true)).toEqual({
      key: "mouse-back",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "mouse-forward" }, true)).toEqual({
      key: "mouse-forward",
      shift: false,
    });
    expect(validateKeyMessage({ type: "opendoc-key", key: "w" }, false)).toBeNull();
    for (const bad of [
      { type: "opendoc-key", key: "Enter" },
      { type: "opendoc-key", key: "F5" },
      { type: "opendoc-key", key: "" },
      { type: "opendoc-key", key: 5 },
      { type: "opendoc-key" },
      { type: "opendoc-scroll", y: 1 },
    ]) {
      expect(validateKeyMessage(bad, true), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("keyRateAllow", () => {
  it("máximo 10/s con ventana deslizante", () => {
    let times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = keyRateAllow(times, i * 50);
      expect(r.allowed).toBe(true);
      times = r.times;
    }
    expect(keyRateAllow(times, 500).allowed).toBe(false);
    // Tras la ventana se permite de nuevo y se poda lo viejo.
    const r = keyRateAllow(times, 2000);
    expect(r.allowed).toBe(true);
    expect(r.times).toEqual([2000]);
  });
});

describe("matchParentShortcut", () => {
  const base = { key: "", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  it("atajos exactos sin choques", () => {
    expect(matchParentShortcut({ ...base, key: "w" })).toEqual({ action: "close-tab" });
    expect(matchParentShortcut({ ...base, key: "t" })).toEqual({ action: "new-tab" });
    expect(matchParentShortcut({ ...base, key: "T", shiftKey: true })).toEqual({ action: "reopen-tab" });
    expect(matchParentShortcut({ ...base, key: "Tab" })).toEqual({ action: "next-tab" });
    expect(matchParentShortcut({ ...base, key: "Tab", shiftKey: true })).toEqual({ action: "prev-tab" });
    expect(matchParentShortcut({ ...base, key: "3" })).toEqual({ action: "tab-n", index: 2 });
    expect(matchParentShortcut({ ...base, key: "k" })).toBeNull();
    expect(matchParentShortcut({ ...base, key: "w", shiftKey: true })).toBeNull();
    expect(
      matchParentShortcut({ key: "ArrowLeft", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }),
    ).toEqual({ action: "back" });
    expect(
      matchParentShortcut({ key: "ArrowRight", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }),
    ).toEqual({ action: "forward" });
    expect(matchParentShortcut({ ...base, key: "ArrowLeft" })).toBeNull();
  });
});
