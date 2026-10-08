import { describe, expect, it } from "vitest";
import { dropTokens, filterKeys, ghostFor, tailAfterColon } from "./paletteFilter";

const DOCSETS = [
  { id: "css", name: "CSS", platform: "css" },
  { id: "c", name: "C++", platform: null },
];
const PENDING = [{ id: "python-3", name: "Python_3" }];

describe("filterKeys", () => {
  it("familia, nombre e id de cargados y pendientes", () => {
    expect(filterKeys(DOCSETS, PENDING)).toEqual([
      "css",
      "c++",
      "c",
      "python_3",
      "python-3",
    ]);
  });
});

describe("ghostFor", () => {
  const keys = filterKeys(DOCSETS, PENDING);
  it("solo con coincidencia única y sin dos puntos", () => {
    // "py" es ambigua (python_3 y python-3); "python_" solo una.
    expect(ghostFor("py", keys)).toBeNull();
    expect(ghostFor("python_", keys)).toBe("3:");
    expect(ghostFor("", keys)).toBeNull();
    expect(ghostFor("css:", keys)).toBeNull();
    expect(ghostFor("c", keys)).toBeNull(); // c, c++, css: ambigua
    expect(ghostFor("zzz", keys)).toBeNull();
  });
});

describe("tailAfterColon", () => {
  it("cola o null sin sintaxis", () => {
    expect(tailAfterColon("cpp:vector")).toBe("vector");
    expect(tailAfterColon("cpp:")).toBe("");
    expect(tailAfterColon("std::vector")).toBeNull();
    expect(tailAfterColon("vector")).toBeNull();
  });
});

describe("dropTokens", () => {
  it("quita uno o el último", () => {
    expect(dropTokens("cpp,py:x", (p) => p.filter((t) => t !== "py"))).toBe("cpp:x");
    expect(dropTokens("cpp,py:x", (p) => p.slice(0, -1))).toBe("cpp:x");
    expect(dropTokens("cpp:x", (p) => p.slice(0, -1))).toBe("x");
    expect(dropTokens("x", (p) => p.slice(0, -1))).toBeNull();
    expect(dropTokens("std::x", (p) => p.slice(0, -1))).toBeNull();
  });
});
